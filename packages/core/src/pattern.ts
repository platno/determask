/**
 * Pattern recognizers: the building block every locale pack uses (M1).
 *
 * A recognizer is DATA — patterns, a validator, context words, examples —
 * and this module turns it into a `Recognizer`. The scoring follows D7:
 *
 *   pattern score → validator (gate, may regrade) → context boost → engine threshold
 *
 * Patterns run on the FOLDED view (lower case, accents stripped, đ→d,
 * full-width folded, format characters as spaces), so every pack gets the
 * same Unicode hardening for free. Write patterns against folded text:
 * lower-case letters, ASCII digits.
 *
 * Context (D8): words are matched whole, on the folded view, in a window
 * that stops at the nearest other number — "CCCD 001…, SĐT 0912…" does not
 * give the phone the CCCD's context. Anti-context words count only BEFORE
 * the value, and reject the candidate.
 *
 * A validator that throws counts as a pass and the candidate is masked at
 * full score (D9): privacy fails closed, never open.
 */
import { ConfigError } from "./errors.js";
import { foldValue, hasWordBoundaries } from "./fold.js";
import type {
  PatternInfo,
  Recognizer,
  RecognizerExamples,
  RuleStep,
  Span,
  TextViews,
} from "./types.js";

/** One regex a recognizer runs, with the score a bare match gets. */
export interface PatternDef extends PatternInfo {
  /** Score of a match before validation and context, in [0, 1]. */
  score: number;
}

/**
 * What a validator says about a candidate: `false` rejects it, `true` keeps
 * the pattern score, an object regrades it and may add attributes.
 */
export type ValidatorResult =
  | boolean
  | { score?: number; attrs?: Record<string, string>; note?: string };

export interface PatternRecognizerSpec {
  id: string;
  entity: string;
  locales: readonly string[];
  patterns: readonly PatternDef[];
  /**
   * Gate and grade each candidate. Receives the match as folded (ASCII
   * digits, lower case) and as it appears in the original text.
   */
  validate?: (folded: string, original: string) => ValidatorResult;
  /** Words that raise the score when found near the value, before or after. */
  context?: readonly string[];
  /** How much a context word adds to the score. Default 0.35. */
  contextBoost?: number;
  /** Words that, BEFORE the value, mean it is not this entity. */
  antiContext?: readonly string[];
  /** How far around the value to look for context, in folded code units. Default 40. */
  window?: number;
  /** Attributes every span of this recognizer carries. */
  attrs?: Record<string, string>;
  /** Required (D20): at least one example that must match and one that must not. */
  examples: RecognizerExamples;
}

export const DEFAULT_CONTEXT_BOOST = 0.35;
export const DEFAULT_WINDOW = 40;

const DIGIT = /\d/u;

interface Compiled {
  def: PatternDef;
  re: RegExp;
}

function assertScore(value: unknown, what: string): void {
  if (typeof value !== "number" || !(value >= 0 && value <= 1)) {
    throw new ConfigError(`${what} must be a number in [0, 1]`);
  }
}

/** Fold a word list once, at load. A word that folds to nothing is a bug. */
function foldWords(words: readonly string[] | undefined, what: string): string[] {
  return (words ?? []).map((w) => {
    const folded = foldValue(w);
    if (folded.length === 0) throw new ConfigError(`${what}: a word folds to nothing`);
    return folded;
  });
}

/** Does `word` occur as a whole word inside folded[from, to)? */
function hasWord(folded: string, from: number, to: number, word: string): boolean {
  let at = folded.indexOf(word, from);
  while (at !== -1 && at + word.length <= to) {
    if (hasWordBoundaries(folded, at, at + word.length)) return true;
    at = folded.indexOf(word, at + 1);
  }
  return false;
}

/** [from, start): up to `window` units before, cut just after the nearest digit. */
function rangeBefore(folded: string, start: number, window: number): [number, number] {
  let from = Math.max(0, start - window);
  for (let i = start - 1; i >= from; i--) {
    if (DIGIT.test(folded[i] as string)) {
      from = i + 1;
      break;
    }
  }
  return [from, start];
}

/** [end, to): up to `window` units after, cut just before the nearest digit. */
function rangeAfter(folded: string, end: number, window: number): [number, number] {
  const limit = Math.min(folded.length, end + window);
  for (let i = end; i < limit; i++) {
    if (DIGIT.test(folded[i] as string)) return [end, i];
  }
  return [end, limit];
}

export function patternRecognizer(spec: PatternRecognizerSpec): Recognizer {
  if (spec.patterns.length === 0) throw new ConfigError(`${spec.id}: no patterns`);
  if (spec.examples.match.length === 0 || spec.examples.noMatch.length === 0) {
    throw new ConfigError(`${spec.id}: needs at least one match and one noMatch example (D20)`);
  }
  const boost = spec.contextBoost ?? DEFAULT_CONTEXT_BOOST;
  assertScore(boost, `${spec.id}: contextBoost`);
  const window = spec.window ?? DEFAULT_WINDOW;
  if (!Number.isInteger(window) || window < 0) {
    throw new ConfigError(`${spec.id}: window must be a non-negative integer`);
  }
  const context = foldWords(spec.context, `${spec.id} context`);
  const anti = foldWords(spec.antiContext, `${spec.id} antiContext`);

  const compiled: Compiled[] = spec.patterns.map((def) => {
    assertScore(def.score, `${spec.id} pattern ${def.name}: score`);
    try {
      return { def, re: new RegExp(def.regex, "gu") };
    } catch {
      throw new ConfigError(`${spec.id} pattern ${def.name}: invalid regex`);
    }
  });

  function analyze(views: TextViews): Span[] {
    const { text: folded, starts, ends } = views.folded;
    const spans: Span[] = [];

    for (const { def, re } of compiled) {
      re.lastIndex = 0;
      for (let m = re.exec(folded); m !== null; m = re.exec(folded)) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const fs = m.index;
        const fe = fs + m[0].length;
        if (!hasWordBoundaries(folded, fs, fe)) continue;

        const start = starts[fs] as number;
        const end = ends[fe - 1] as number;
        let score = def.score;
        let attrs: Record<string, string> = { ...spec.attrs };
        const trace: RuleStep[] = [{ rule: `pattern:${def.name}`, scoreAfter: score }];

        if (spec.validate !== undefined) {
          let verdict: ValidatorResult;
          try {
            verdict = spec.validate(m[0], views.original.slice(start, end));
          } catch {
            verdict = { score: 1, note: "validator threw — counted as a pass (D9)" };
          }
          if (verdict === false) continue;
          if (verdict === true) {
            trace.push({ rule: "validator", detail: "pass", scoreAfter: score });
          } else {
            const before = score;
            if (verdict.score !== undefined) score = verdict.score;
            if (verdict.attrs !== undefined) attrs = { ...attrs, ...verdict.attrs };
            trace.push({
              rule: "validator",
              detail: verdict.note ?? "pass",
              scoreBefore: before,
              scoreAfter: score,
            });
          }
        }

        const [bFrom, bTo] = rangeBefore(folded, fs, window);
        const rejectedBy = anti.find((w) => hasWord(folded, bFrom, bTo, w));
        if (rejectedBy !== undefined) continue;

        const [aFrom, aTo] = rangeAfter(folded, fe, window);
        const hint = context.find((w) => hasWord(folded, bFrom, bTo, w) || hasWord(folded, aFrom, aTo, w));
        if (hint !== undefined) {
          const before = score;
          score = Math.min(1, score + boost);
          trace.push({ rule: "context", detail: hint, scoreBefore: before, scoreAfter: score });
        }

        const span: Span = { entity: spec.entity, start, end, score, recognizer: spec.id, trace };
        if (Object.keys(attrs).length > 0) span.attrs = attrs;
        spans.push(span);
      }
    }
    return spans;
  }

  return {
    id: spec.id,
    entities: [spec.entity],
    locales: [...spec.locales],
    analyze,
    patterns: spec.patterns.map(({ name, regex }) => ({ name, regex })),
    examples: spec.examples,
  };
}
