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
 * All values are matched in one pass with an Aho-Corasick automaton (D6),
 * so a long value list or a long document stays linear.
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

/** A multi-needle matcher: every occurrence of every needle, in one pass. */
interface Automaton {
  goto: Map<number, number>[];
  fail: number[];
  /** Needle indices that end at each state, its fail chain included. */
  out: number[][];
}

/** Aho-Corasick over UTF-16 units (D6); a well-formed needle only matches at code-point boundaries. */
function automaton(needles: readonly string[]): Automaton {
  const goto: Map<number, number>[] = [new Map()];
  const fail = [0];
  const out: number[][] = [[]];
  needles.forEach((needle, id) => {
    let state = 0;
    for (let i = 0; i < needle.length; i++) {
      const unit = needle.charCodeAt(i);
      let next = (goto[state] as Map<number, number>).get(unit);
      if (next === undefined) {
        next = goto.length;
        goto.push(new Map());
        fail.push(0);
        out.push([]);
        (goto[state] as Map<number, number>).set(unit, next);
      }
      state = next;
    }
    (out[state] as number[]).push(id);
  });
  const queue = [...(goto[0] as Map<number, number>).values()];
  for (let q = 0; q < queue.length; q++) {
    const state = queue[q] as number;
    for (const [unit, next] of goto[state] as Map<number, number>) {
      let f = fail[state] as number;
      while (f !== 0 && !(goto[f] as Map<number, number>).has(unit)) f = fail[f] as number;
      const target = (goto[f] as Map<number, number>).get(unit);
      fail[next] = target ?? 0;
      out[next] = [...(out[next] as number[]), ...(out[fail[next] as number] as number[])];
      queue.push(next);
    }
  }
  return { goto, fail, out };
}

/** Every [needle index, start, end) occurrence in `text`, overlapping ones included. */
function occurrences(needles: readonly string[], text: string): [number, number, number][] {
  if (needles.length === 0) return [];
  const { goto, fail, out } = automaton(needles);
  const found: [number, number, number][] = [];
  let state = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    while (state !== 0 && !(goto[state] as Map<number, number>).has(unit)) state = fail[state] as number;
    state = (goto[state] as Map<number, number>).get(unit) ?? 0;
    for (const id of out[state] as number[]) {
      found.push([id, i + 1 - (needles[id] as string).length, i + 1]);
    }
  }
  return found;
}

/** Where a value was found, in original offsets, and how. */
export interface ValueMatch {
  /** Index of the value in the list passed in. */
  index: number;
  start: number;
  end: number;
  numeric: boolean;
}

/**
 * Every occurrence of every value, folded and boundary-checked, numbers
 * whatever their grouping. One pass over the text per kind of value, so
 * the cost does not grow with the number of values times the length.
 * Ordered by value, then by position.
 */
export function findValues(views: TextViews, values: readonly string[]): ValueMatch[] {
  const view: FoldedView = views.folded;
  const { text: folded, starts, ends } = view;
  const texts: { needle: string; index: number }[] = [];
  const numbers: { needle: string; index: number }[] = [];
  values.forEach((value, index) => {
    const needle = foldValue(value);
    if (needle.length === 0) return;
    const digits = needle.replace(/\D/gu, "");
    if (NUMERIC_VALUE.test(needle) && digits.length >= MIN_DIGITS) numbers.push({ needle: digits, index });
    else texts.push({ needle, index });
  });

  const found: ValueMatch[] = [];
  for (const [id, from, to] of occurrences(
    texts.map((t) => t.needle),
    folded,
  )) {
    if (!hasWordBoundaries(folded, from, to)) continue;
    const { index } = texts[id] as { index: number };
    found.push({ index, start: starts[from] as number, end: ends[to - 1] as number, numeric: false });
  }
  if (numbers.length > 0) {
    const view = compact(folded);
    for (const [id, from, to] of occurrences(
      numbers.map((n) => n.needle),
      view.text,
    )) {
      if (!wholeNumber(view, folded, from, to)) continue;
      const fStart = view.at[from] as number;
      const fEnd = (view.at[to - 1] as number) + 1;
      const { index } = numbers[id] as { index: number };
      found.push({ index, start: starts[fStart] as number, end: ends[fEnd - 1] as number, numeric: true });
    }
  }
  // One value never matches twice at the same start, so this order is total.
  return found.sort((a, b) => a.index - b.index || a.start - b.start);
}

export function matchKnownValues(views: TextViews, knownValues: KnownValues): Span[] {
  const owners: string[] = [];
  const values: string[] = [];
  for (const [entity, list] of Object.entries(knownValues)) {
    for (const value of list) {
      owners.push(entity);
      values.push(value);
    }
  }
  return findValues(views, values).map((m) => {
    const entity = owners[m.index] as string;
    return span(entity, m.start, m.end, `${m.numeric ? "number" : "folded"} match for ${entity}`);
  });
}
