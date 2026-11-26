/**
 * Masking structured data: a log record, an API payload, an error event.
 *
 * `maskJson` walks a plain JSON value and masks every string in it — values
 * and, by default, object keys and numbers — with ONE placeholder map, so
 * the same email in `user.email` and in an exception message gets the same
 * token, and `restoreJson` puts every value back.
 *
 * Each string is analysed on its own, and a second time with the name of
 * the property it sits under in front of it: `{ "cmnd": "012345678" }` is
 * also read as "cmnd: 012345678", so a recognizer that needs its label
 * finds it. `phoneNumber` and `phone_number` are read as "phone Number" and
 * "phone number". The property name can only ADD findings: the two
 * analyses are unioned, so `{ "invoice": "call me 0912345678" }` cannot
 * turn "invoice" into anti-context and leak the phone.
 *
 * Fails closed (D14): anything that is not plain JSON — a cycle, a Date, a
 * Map, a class instance, a function, a bigint — or nesting deeper than
 * `maxDepth` is withheld rather than guessed at.
 */
import { WithheldError } from "./errors.js";
import type { AnalyzeOptions, Engine, Span } from "./types.js";

export interface MaskJsonOptions extends AnalyzeOptions {
  /** Mask object keys as well as values. Default true. */
  keys?: boolean;
  /**
   * `"mask"` (default): a number is analysed as text, and one that holds a
   * finding is replaced by its placeholder, as a string. `"keep"` leaves
   * numbers alone.
   */
  numbers?: "mask" | "keep";
  /** How many arrays and objects may nest; deeper input is withheld. Default 256. */
  maxDepth?: number;
}

export interface MaskJsonResult {
  /** A new value with the same shape; the input is not modified. */
  value: unknown;
  /** placeholder token -> original value, for every string in `value`. */
  map: Record<string, string>;
  report: { counts: Record<string, number> };
}

export const DEFAULT_MAX_DEPTH = 256;

/** A masked or restored copy of the input, built from its parts. */
type Node =
  | { kind: "leaf"; value: unknown }
  | { kind: "text"; slot: number }
  | { kind: "number"; slot: number; value: number }
  | { kind: "array"; items: Node[] }
  | { kind: "object"; entries: { key: Node; value: Node }[] };

interface Slot {
  text: string;
  /** The property name this string sits under, used as context. */
  context: string;
}

const isPlainObject = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

const describe = (v: unknown): string =>
  typeof v === "object" && v !== null ? (v.constructor?.name ?? "object") : typeof v;

/** "phoneNumber" / "phone_number" / "phone-number" → words a context list can match. */
function contextOf(key: string): string {
  return key.replace(/[_\-.]+/gu, " ").replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
}

function walk(
  value: unknown,
  options: { keys: boolean; numbers: boolean; maxDepth: number },
  slots: Slot[],
): Node {
  const ancestors = new Set<object>();
  const visit = (v: unknown, context: string, depth: number, path: string): Node => {
    if (typeof v === "string") {
      slots.push({ text: v, context });
      return { kind: "text", slot: slots.length - 1 };
    }
    if (typeof v === "number") {
      if (!options.numbers || !Number.isFinite(v)) return { kind: "leaf", value: v };
      slots.push({ text: String(v), context });
      return { kind: "number", slot: slots.length - 1, value: v };
    }
    if (v === null || v === undefined || typeof v === "boolean") return { kind: "leaf", value: v };
    if (typeof v !== "object") throw new WithheldError(`maskJson: ${path} is a ${describe(v)}, not JSON; withholding`);
    if (depth >= options.maxDepth) {
      throw new WithheldError(`maskJson: ${path} is nested deeper than ${options.maxDepth}; withholding`);
    }
    if (ancestors.has(v)) throw new WithheldError(`maskJson: ${path} is a cycle; withholding`);
    if (!Array.isArray(v) && !isPlainObject(v)) {
      throw new WithheldError(`maskJson: ${path} is a ${describe(v)}, not a plain object; withholding`);
    }
    ancestors.add(v);
    let node: Node;
    if (Array.isArray(v)) {
      node = { kind: "array", items: v.map((item, i) => visit(item, context, depth + 1, `${path}[${i}]`)) };
    } else {
      node = {
        kind: "object",
        entries: Object.keys(v).map((key) => {
          const keyNode: Node = options.keys
            ? (slots.push({ text: key, context: "" }), { kind: "text", slot: slots.length - 1 })
            : { kind: "leaf", value: key };
          const child = (v as Record<string, unknown>)[key];
          return { key: keyNode, value: visit(child, contextOf(key), depth + 1, `${path}.${key}`) };
        }),
      };
    }
    ancestors.delete(v);
    return node;
  };
  return visit(value, "", 0, "$");
}

function build(node: Node, texts: readonly string[]): unknown {
  switch (node.kind) {
    case "leaf":
      return node.value;
    case "text":
      return texts[node.slot];
    case "number": {
      // A number nothing was found in stays the very same number (-0 too).
      const text = texts[node.slot] as string;
      return text === String(node.value) ? node.value : text;
    }
    case "array":
      return node.items.map((item) => build(item, texts));
    case "object": {
      const out: Record<string, unknown> = {};
      for (const { key, value } of node.entries) {
        const k = build(key, texts) as string;
        if (Object.hasOwn(out, k)) {
          throw new WithheldError("maskJson: two keys of one object became the same text; withholding");
        }
        // defineProperty, so a "__proto__" key is a key, not the prototype.
        Object.defineProperty(out, k, { value: build(value, texts), enumerable: true, writable: true, configurable: true });
      }
      return out;
    }
  }
}

/** A character no slot contains, to join the slots and split them back exactly. */
function separator(slots: readonly Slot[]): string {
  for (let cp = 0xe000; cp <= 0xf8ff; cp++) {
    const sep = String.fromCodePoint(cp);
    if (!slots.some((s) => s.text.includes(sep))) return sep;
  }
  throw new WithheldError("maskJson: the input uses every private-use character; withholding");
}

export function maskJson(engine: Engine, value: unknown, options: MaskJsonOptions = {}): MaskJsonResult {
  const { keys = true, numbers = "mask", maxDepth = DEFAULT_MAX_DEPTH, ...analyzeOptions } = options;
  const slots: Slot[] = [];
  const tree = walk(value, { keys, numbers: numbers === "mask", maxDepth }, slots);

  // Analyse each string bare and with its property name in front, then
  // anonymize all of them as one document, so placeholders are shared.
  const sep = separator(slots);
  const findings: Span[] = [];
  let offset = 0;
  for (const { text, context } of slots) {
    for (const f of engine.analyze(text, analyzeOptions).findings) {
      findings.push({ ...f, start: offset + f.start, end: offset + f.end });
    }
    if (context !== "") {
      const prefix = `${context}: `;
      for (const f of engine.analyze(prefix + text, analyzeOptions).findings) {
        if (f.end <= prefix.length) continue; // found in the property name only
        const start = Math.max(f.start, prefix.length) - prefix.length;
        findings.push({ ...f, start: offset + start, end: offset + f.end - prefix.length });
      }
    }
    offset += text.length + sep.length;
  }
  const masked = engine.anonymize(slots.map((s) => s.text).join(sep), findings);
  return { value: build(tree, masked.text.split(sep)), map: masked.map, report: masked.report };
}

export interface RestoreJsonOptions {
  /** Strict (default): a placeholder-shaped token not in the map throws. */
  strict?: boolean;
  maxDepth?: number;
}

/**
 * Put every masked value back, in strings and keys. A number that was
 * masked comes back as a string: its placeholder was a string.
 */
export function restoreJson(
  engine: Engine,
  value: unknown,
  map: Record<string, string>,
  options: RestoreJsonOptions = {},
): unknown {
  const slots: Slot[] = [];
  const tree = walk(value, { keys: true, numbers: false, maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH }, slots);
  const texts = slots.map((s) => engine.restore(s.text, map, { strict: options.strict ?? true }));
  return build(tree, texts);
}
