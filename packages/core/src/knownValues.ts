/**
 * Known-values recognizer (D11): the patient's own record is the strongest
 * deterministic signal. Values are matched on the folded view — case,
 * diacritics (incl. đ→d), script (Cyrillic ↔ Latin) and whitespace runs
 * ignored — and every occurrence in the document is reported.
 *
 * A value that is a NUMBER (six or more digits, and nothing but digits and
 * separators) is matched regardless of how it is grouped: the record's
 * `0912345678` finds `0912 345 678`, `0912.345.678` and `0912-345-678` in
 * the text, and the other way round.
 *
 * The literature behind this: PhysioNet deid missed no patient names when
 * matching record values; see docs/ARCHITECTURE.md.
 *
 * M1 replaces the indexOf loops with a code-point Aho-Corasick automaton
 * (D6); the observable behaviour must not change.
 */
import { foldValue, hasWordBoundaries } from "./fold.js";
import type { FoldedView, KnownValues, Span, TextViews } from "./types.js";

export const KNOWN_VALUES_RECOGNIZER_ID = "core.known-values";

/** Characters a number may be grouped with. */
const SEPARATOR = /[ .\-/()]/u;
const NUMERIC_VALUE = /^[\d .\-/()+]+$/u;
const MIN_DIGITS = 6;

/** The folded text with separators removed, and where each kept unit came from. */
interface CompactView {
  text: string;
  /** at[i] = index in the folded text of compact unit i. */
  at: number[];
}

function compact(folded: string): CompactView {
  let text = "";
  const at: number[] = [];
  for (let i = 0; i < folded.length; i++) {
    const c = folded[i] as string;
    if (SEPARATOR.test(c)) continue;
    text += c;
    at.push(i);
  }
  return { text, at };
}

const DIGIT = /\d/u;

/**
 * A compact match is a whole number unless a digit sits right next to it
 * IN THE FOLDED TEXT — a digit that only became adjacent because a
 * separator was removed ("Giường 12 0912345678") is a boundary.
 */
function wholeNumber(view: CompactView, folded: string, from: number, to: number): boolean {
  const first = view.at[from] as number;
  const last = view.at[to - 1] as number;
  const before = first > 0 ? folded[first - 1] : undefined;
  const after = last + 1 < folded.length ? folded[last + 1] : undefined;
  return !(before !== undefined && DIGIT.test(before)) && !(after !== undefined && DIGIT.test(after));
}

function span(entity: string, start: number, end: number, detail: string): Span {
  return {
    entity,
    start,
    end,
    score: 1,
    recognizer: KNOWN_VALUES_RECOGNIZER_ID,
    trace: [{ rule: "known-value", detail }],
  };
}

export function matchKnownValues(views: TextViews, knownValues: KnownValues): Span[] {
  const spans: Span[] = [];
  const view: FoldedView = views.folded;
  const { text: folded, starts, ends } = view;
  let numbers: CompactView | undefined; // built on first use

  for (const [entity, values] of Object.entries(knownValues)) {
    for (const value of values) {
      const needle = foldValue(value);
      if (needle.length === 0) continue;

      const digits = needle.replace(/\D/gu, "");
      if (NUMERIC_VALUE.test(needle) && digits.length >= MIN_DIGITS) {
        numbers ??= compact(folded);
        for (let at = numbers.text.indexOf(digits); at !== -1; at = numbers.text.indexOf(digits, at + 1)) {
          if (!wholeNumber(numbers, folded, at, at + digits.length)) continue;
          const fStart = numbers.at[at] as number;
          const fEnd = (numbers.at[at + digits.length - 1] as number) + 1;
          spans.push(span(entity, starts[fStart] as number, ends[fEnd - 1] as number, `number match for ${entity}`));
        }
        continue;
      }

      for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + 1)) {
        if (!hasWordBoundaries(folded, at, at + needle.length)) continue;
        spans.push(
          span(entity, starts[at] as number, ends[at + needle.length - 1] as number, `folded match for ${entity}`),
        );
      }
    }
  }
  return spans;
}
