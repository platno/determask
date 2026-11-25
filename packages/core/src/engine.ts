/**
 * The engine: analyze → anonymize → restore.
 *
 * v0 slice: the known-values recognizer (D11), the placeholder operator
 * with document-scoped consistency (D18), union overlap resolution (D10),
 * and strict restore. Pattern recognizers, scoring rule sets, the
 * protected layer and the residual check arrive in M1/M2 — see ROADMAP.md.
 *
 * Fail-closed invariants already enforced here (D14/D18):
 *   - unknown config keys refuse to load;
 *   - input that already contains placeholder-shaped tokens is withheld
 *     (literal escaping lands in M3);
 *   - strict restore throws on any unknown placeholder.
 */
import { ConfigError, RestoreError, WithheldError } from "./errors.js";
import { foldText } from "./fold.js";
import { matchKnownValues } from "./knownValues.js";
import type {
  AnalyzeOptions,
  AnalyzeResult,
  AnonymizeOptions,
  AnonymizeResult,
  Engine,
  EngineConfig,
  RestoreOptions,
  Span,
  TextViews,
} from "./types.js";

/** Placeholder shape: ⟦TYPE_n⟧. Opaque brackets survive MT tokenizers. */
const PLACEHOLDER = /⟦[A-Z][A-Z0-9_]*_\d+⟧/gu;

const KNOWN_CONFIG_KEYS = new Set(["configVersion", "name", "locales", "onError"]);

function validateConfig(config: EngineConfig): void {
  if (config === null || typeof config !== "object") {
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
  if (config.onError !== undefined && config.onError !== "withhold") {
    throw new ConfigError(`unknown onError mode: ${JSON.stringify(config.onError)}`);
  }
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

export function createEngine(config: EngineConfig): Engine {
  validateConfig(config);

  function analyze(text: string, options: AnalyzeOptions = {}): AnalyzeResult {
    const views: TextViews = { original: text, folded: foldText(text) };
    const findings: Span[] = [];
    if (options.knownValues !== undefined) {
      findings.push(...matchKnownValues(views, options.knownValues));
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
      if (
        !Number.isInteger(span.start) ||
        !Number.isInteger(span.end) ||
        span.start < 0 ||
        span.end > text.length ||
        span.start >= span.end
      ) {
        throw new WithheldError(`invalid span offsets for entity ${span.entity}; withholding`);
      }
    }

    const resolved = unionOverlaps(findings);
    const counters = new Map<string, number>();
    const byValue = new Map<string, string>(); // entity\0value -> placeholder (document scope)
    const map: Record<string, string> = {};
    const counts: Record<string, number> = {};

    // Replace right-to-left so earlier offsets stay valid.
    let out = text;
    for (const span of [...resolved].sort((a, b) => b.start - a.start)) {
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
      out = out.slice(0, span.start) + token + out.slice(span.end);
      counts[span.entity] = (counts[span.entity] ?? 0) + 1;
    }

    return { text: out, map, report: { counts } };
  }

  function restore(
    text: string,
    map: Record<string, string>,
    options: RestoreOptions = {},
  ): string {
    const strict = options.strict ?? true;
    return text.replace(PLACEHOLDER, (token) => {
      const value = map[token];
      if (value === undefined) {
        if (strict) {
          throw new RestoreError(`placeholder not in map: ${token}`);
        }
        return token;
      }
      return value;
    });
  }

  return { analyze, anonymize, restore };
}
