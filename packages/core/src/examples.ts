/**
 * Run a recognizer's embedded examples (D20) through a real engine, at the
 * default threshold — the same path production text takes.
 *
 * In a `match` example, every span the recognizer must report is marked
 * ⟪like this⟫, and it must report exactly those spans of its entities.
 * A `noMatch` example must produce none. The return value lists every
 * failure in words; an empty list means every example holds.
 */
import { createEngine } from "./engine.js";
import type { EngineConfig, Recognizer } from "./types.js";

const OPEN = "⟪"; // ⟪
const CLOSE = "⟫"; // ⟫

export interface ExampleCheckOptions {
  /** Engine config to run under (thresholds, locales). Default `{ configVersion: 1 }`. */
  config?: EngineConfig;
  /** Locale to analyze with. Default: the recognizer's first locale, unless it is "*". */
  locale?: string;
}

/** Strip the ⟪…⟫ markers, returning the text and the marked [start, end) ranges. */
export function parseMarkedExample(marked: string): { text: string; spans: [number, number][] } | null {
  let text = "";
  const spans: [number, number][] = [];
  let open = -1;
  for (const ch of marked) {
    if (ch === OPEN) {
      if (open !== -1) return null;
      open = text.length;
    } else if (ch === CLOSE) {
      if (open === -1 || open === text.length) return null;
      spans.push([open, text.length]);
      open = -1;
    } else {
      text += ch;
    }
  }
  return open === -1 && spans.length > 0 ? { text, spans } : null;
}

export function checkExamples(recognizer: Recognizer, options: ExampleCheckOptions = {}): string[] {
  const failures: string[] = [];
  const examples = recognizer.examples;
  if (examples === undefined) return [`${recognizer.id}: carries no examples`];

  const engine = createEngine(options.config ?? { configVersion: 1 }, { recognizers: [recognizer] });
  const first = recognizer.locales[0] as string;
  const locale = options.locale ?? (first === "*" ? undefined : first);
  const mine = (text: string) =>
    engine
      .analyze(text, locale === undefined ? {} : { locale })
      .findings.filter((f) => recognizer.entities.includes(f.entity));

  for (const marked of examples.match) {
    const parsed = parseMarkedExample(marked);
    if (parsed === null) {
      failures.push(`${recognizer.id}: malformed match example ${JSON.stringify(marked)}`);
      continue;
    }
    const found = mine(parsed.text).map((f) => `${f.start}-${f.end}`).sort();
    const wanted = parsed.spans.map(([s, e]) => `${s}-${e}`).sort();
    if (found.join() !== wanted.join()) {
      failures.push(
        `${recognizer.id}: ${JSON.stringify(marked)} — expected spans [${wanted.join(", ")}], found [${found.join(", ")}]`,
      );
    }
  }

  for (const text of examples.noMatch) {
    const found = mine(text);
    if (found.length > 0) {
      failures.push(
        `${recognizer.id}: ${JSON.stringify(text)} must not match, found [${found.map((f) => `${f.start}-${f.end}`).join(", ")}]`,
      );
    }
  }
  return failures;
}
