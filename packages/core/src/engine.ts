/**
 * The engine: analyze → anonymize → restore.
 *
 * v0 slice: the known-values recognizer (D11), pluggable recognizers and
 * locale packs (D2/D15), the placeholder operator with document-scoped
 * consistency (D18), union overlap resolution (D10), and strict restore.
 * Pattern recognizers, scoring rule sets, the protected layer and the
 * residual check arrive in M1/M2 — see ROADMAP.md.
 *
 * Fail-closed invariants enforced here (D14/D17/D18/D20):
 *   - unknown config keys, at any level, refuse to load;
 *   - entity ids must be SCREAMING_SNAKE, so every placeholder is one
 *     restore recognises — a lowercase id would yield a token strict
 *     restore silently skips;
 *   - input that already contains placeholder-shaped tokens is withheld
 *     (literal escaping lands in M3);
 *   - a recognizer that throws, or returns an out-of-range span, withholds
 *     the text — its error message is never propagated, because it may
 *     quote the input;
 *   - strict restore throws on any unknown placeholder.
 */
import { ConfigError, RestoreError, WithheldError } from "./errors.js";
import { foldText } from "./fold.js";
import { matchKnownValues } from "./knownValues.js";
import type {
  AnalyzeContext,
  AnalyzeOptions,
  AnalyzeResult,
  AnonymizeOptions,
  AnonymizeResult,
  Engine,
  EngineConfig,
  EngineOptions,
  Recognizer,
  RestoreOptions,
  Span,
  TextViews,
} from "./types.js";

/** Placeholder shape: ⟦TYPE_n⟧. Opaque brackets survive MT tokenizers. */
const PLACEHOLDER = /⟦[A-Z][A-Z0-9_]*_\d+⟧/gu;

/** Entity ids (catalogue convention): SCREAMING_SNAKE. */
const ENTITY_ID = /^[A-Z][A-Z0-9_]*$/;

const KNOWN_CONFIG_KEYS = new Set(["configVersion", "name", "locales", "onError"]);
const KNOWN_LOCALES_KEYS = new Set(["primary", "also"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateConfig(config: EngineConfig): void {
  if (!isPlainObject(config)) {
    throw new ConfigError("config must be an object");
  }
  for (const key of Object.keys(config)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      // F13: silent defaults and typos are how privacy tools fail open.
      throw new ConfigError(`unknown config key: ${JSON.stringify(key)}`);
    }
  }
  if (config.configVersion !== 1) {
    throw new ConfigError(`unsupported configVersion: ${String(config.configVersion)}`);
  }
  if (config.name !== undefined && typeof config.name !== "string") {
    throw new ConfigError("config.name must be a string");
  }
  if (config.onError !== undefined && config.onError !== "withhold") {
    throw new ConfigError(`unknown onError mode: ${JSON.stringify(config.onError)}`);
  }
  if (config.locales !== undefined) {
    const locales: unknown = config.locales;
    if (!isPlainObject(locales)) {
      throw new ConfigError("config.locales must be an object");
    }
    for (const key of Object.keys(locales)) {
      if (!KNOWN_LOCALES_KEYS.has(key)) {
        throw new ConfigError(`unknown config key: ${JSON.stringify(`locales.${key}`)}`);
      }
    }
    if (typeof locales["primary"] !== "string" || locales["primary"].length === 0) {
      throw new ConfigError("config.locales.primary must be a non-empty string");
    }
    const also = locales["also"];
    if (also !== undefined && (!Array.isArray(also) || !also.every((l) => typeof l === "string"))) {
      throw new ConfigError("config.locales.also must be an array of strings");
    }
  }
}

function assertEntityId(entity: unknown, where: string, Err: typeof ConfigError): void {
  if (typeof entity !== "string" || !ENTITY_ID.test(entity)) {
    throw new Err(`${where}: entity id must be SCREAMING_SNAKE, got ${JSON.stringify(entity)}`);
  }
}

function collectRecognizers(options: EngineOptions): Recognizer[] {
  const all = [...(options.packs ?? []).flatMap((p) => p.recognizers), ...(options.recognizers ?? [])];
  const seen = new Set<string>();
  for (const r of all) {
    if (typeof r.id !== "string" || r.id.length === 0) {
      throw new ConfigError("recognizer id must be a non-empty string");
    }
    if (seen.has(r.id)) {
      throw new ConfigError(`duplicate recognizer id: ${JSON.stringify(r.id)}`);
    }
    seen.add(r.id);
    for (const e of r.entities) assertEntityId(e, `recognizer ${r.id}`, ConfigError);
    if (r.locales.length === 0) {
      throw new ConfigError(`recognizer ${r.id} declares no locales`);
    }
  }
  return all;
}

/**
 * Which recognizers serve a locale (D15/F15). "*" serves every locale; a
 * tag matches exactly or by primary language ("vi" serves "vi-VN"). With
 * no locale known, EVERY recognizer runs: an unknown locale must cost
 * over-masking, never silently dropped recall.
 */
function servesLocale(r: Recognizer, locale: string | undefined): boolean {
  if (locale === undefined) return true;
  const lang = locale.split("-")[0];
  return r.locales.some((l) => l === "*" || l === locale || l === lang);
}

/** Deterministic tie-break (D10): score, then length, then start, then entity. */
function compareSpans(a: Span, b: Span): number {
  if (a.score !== b.score) return b.score - a.score;
  const lenA = a.end - a.start;
  const lenB = b.end - b.start;
  if (lenA !== lenB) return lenB - lenA;
  if (a.start !== b.start) return a.start - b.start;
  return a.entity < b.entity ? -1 : a.entity > b.entity ? 1 : 0;
}

/**
 * Resolve overlaps as `union` (D10/F6): overlapping spans merge into one
 * region covering their union, labelled by the winning span.
 */
function unionOverlaps(findings: readonly Span[]): Span[] {
  const byPosition = [...findings].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number; members: Span[] }[] = [];

  for (const span of byPosition) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      last.members.push(span);
    } else {
      merged.push({ start: span.start, end: span.end, members: [span] });
    }
  }

  return merged.map(({ start, end, members }) => {
    const winner = [...members].sort(compareSpans)[0] as Span;
    return { ...winner, start, end };
  });
}

function isValidSpan(span: Span, length: number): boolean {
  return (
    Number.isInteger(span.start) &&
    Number.isInteger(span.end) &&
    span.start >= 0 &&
    span.end <= length &&
    span.start < span.end
  );
}

const isHigh = (u: number): boolean => u >= 0xd800 && u <= 0xdbff;
const isLow = (u: number): boolean => u >= 0xdc00 && u <= 0xdfff;

/**
 * Widen a span that splits a surrogate pair to the whole code point.
 * Over-masking half a character is the safe direction; emitting a lone
 * surrogate (half an emoji, half a CJK Extension B ideograph) is not.
 */
function snapToCodePoints(span: Span, text: string): Span {
  let { start, end } = span;
  if (start > 0 && isLow(text.charCodeAt(start)) && isHigh(text.charCodeAt(start - 1))) start--;
  if (end < text.length && isLow(text.charCodeAt(end)) && isHigh(text.charCodeAt(end - 1))) end++;
  return start === span.start && end === span.end ? span : { ...span, start, end };
}

export function createEngine(config: EngineConfig, options: EngineOptions = {}): Engine {
  validateConfig(config);
  const recognizers = collectRecognizers(options);

  function analyze(text: string, analyzeOptions: AnalyzeOptions = {}): AnalyzeResult {
    const locale = analyzeOptions.locale ?? config.locales?.primary;
    const views: TextViews = { original: text, folded: foldText(text) };
    const findings: Span[] = [];

    if (analyzeOptions.knownValues !== undefined) {
      for (const entity of Object.keys(analyzeOptions.knownValues)) {
        assertEntityId(entity, "knownValues", WithheldError);
      }
      findings.push(...matchKnownValues(views, analyzeOptions.knownValues));
    }

    const ctx: AnalyzeContext = {
      locale: locale ?? "und",
      ...(analyzeOptions.knownValues !== undefined ? { knownValues: analyzeOptions.knownValues } : {}),
      ...(analyzeOptions.documentId !== undefined ? { documentId: analyzeOptions.documentId } : {}),
    };
    for (const r of recognizers) {
      if (!servesLocale(r, locale)) continue;
      let spans: Span[];
      try {
        spans = r.analyze(views, ctx);
      } catch {
        // D14 + D17: fail closed, and never forward the recognizer's own
        // message — it may quote the text being masked.
        throw new WithheldError(`recognizer ${r.id} failed; withholding`);
      }
      for (const span of spans) {
        if (!isValidSpan(span, text.length)) {
          throw new WithheldError(`recognizer ${r.id} returned an invalid span; withholding`);
        }
        assertEntityId(span.entity, `recognizer ${r.id}`, WithheldError);
      }
      findings.push(...spans);
    }

    findings.sort((a, b) => a.start - b.start || a.end - b.end);
    return { findings };
  }

  function anonymize(
    text: string,
    findings: readonly Span[],
    _options: AnonymizeOptions = {},
  ): AnonymizeResult {
    PLACEHOLDER.lastIndex = 0;
    if (PLACEHOLDER.test(text)) {
      throw new WithheldError(
        "input already contains placeholder-shaped tokens; withholding (literal escaping lands in M3)",
      );
    }
    for (const span of findings) {
      assertEntityId(span.entity, "span", WithheldError);
      if (!isValidSpan(span, text.length)) {
        throw new WithheldError(`invalid span offsets for entity ${span.entity}; withholding`);
      }
    }

    const resolved = unionOverlaps(findings.map((s) => snapToCodePoints(s, text))); // left to right
    const counters = new Map<string, number>();
    const byValue = new Map<string, string>(); // entity\0value -> placeholder (document scope)
    const map: Record<string, string> = {};
    const counts: Record<string, number> = {};

    // Number left to right, so the first mention is _1 ...
    const tokens = resolved.map((span) => {
      const value = text.slice(span.start, span.end);
      const valueKey = `${span.entity}\u0000${value}`;
      let token = byValue.get(valueKey);
      if (token === undefined) {
        const n = (counters.get(span.entity) ?? 0) + 1;
        counters.set(span.entity, n);
        token = `⟦${span.entity}_${n}⟧`;
        byValue.set(valueKey, token);
        map[token] = value;
      }
      counts[span.entity] = (counts[span.entity] ?? 0) + 1;
      return token;
    });

    // ... and replace right to left, so earlier offsets stay valid.
    let out = text;
    for (let i = resolved.length - 1; i >= 0; i--) {
      const span = resolved[i] as Span;
      out = out.slice(0, span.start) + (tokens[i] as string) + out.slice(span.end);
    }

    return { text: out, map, report: { counts } };
  }

  function restore(
    text: string,
    map: Record<string, string>,
    restoreOptions: RestoreOptions = {},
  ): string {
    const strict = restoreOptions.strict ?? true;
    return text.replace(PLACEHOLDER, (token) => {
      if (!Object.hasOwn(map, token)) {
        if (strict) {
          throw new RestoreError(`placeholder not in map: ${token}`);
        }
        return token;
      }
      return map[token] as string;
    });
  }

  return { analyze, anonymize, restore };
}
