/**
 * Folding (D4): build a matching view of the text with an offset map back
 * to the original string.
 *
 * Per code point of the ORIGINAL string:
 *   - Unicode format characters (Cf: zero-width chars, soft hyphen,
 *     LRM/RLM, BOM) become a space, so they cannot dodge detection;
 *   - lower-case, then NFKD (folds full-width forms), then combining
 *     marks are stripped;
 *   - đ/Đ are special-cased to "d" (no canonical decomposition);
 *   - whitespace runs collapse to a single space.
 *
 * Every folded code unit maps back to the original code point that
 * produced it, so matches on the folded view yield original offsets (D3).
 *
 * Note: this is the letter/dictionary view. The full NFC pipeline with a
 * second digit/punctuation view is M1 work; see docs/ARCHITECTURE.md.
 */
import type { FoldedView } from "./types.js";

const FORMAT_CHAR = /^\p{Cf}$/u;
const MARKS = /\p{M}+/gu;
const WHITESPACE = /^\s$/u;

export function foldText(original: string): FoldedView {
  let out = "";
  const starts: number[] = [];
  const ends: number[] = [];

  let i = 0;
  while (i < original.length) {
    const cp = original.codePointAt(i) as number;
    const cpLen = cp > 0xffff ? 2 : 1;
    const ch = original.slice(i, i + cpLen);

    let folded: string;
    if (FORMAT_CHAR.test(ch)) {
      folded = " ";
    } else {
      folded = ch
        .toLowerCase()
        .normalize("NFKD")
        .replace(MARKS, "")
        .replaceAll("đ", "d"); // đ (from đ or lower-cased Đ)
    }

    // Iterate UTF-16 units so `starts`/`ends` stay aligned with `out`
    // even when folding yields astral code points (e.g. Deseret letters).
    for (let k = 0; k < folded.length; k++) {
      const unit = folded[k] as string;
      if (WHITESPACE.test(unit)) {
        // Collapse whitespace runs to one space.
        if (out.endsWith(" ")) continue;
        out += " ";
      } else {
        out += unit;
      }
      starts.push(i);
      ends.push(i + cpLen);
    }
    i += cpLen;
  }

  return { text: out, starts, ends };
}

/** Fold a known value for matching: same folding, trimmed. */
export function foldValue(value: string): string {
  return foldText(value).text.trim();
}

/**
 * Unicode-aware boundary check (D5/F5): the folded characters adjacent to
 * [start, end) must not be letters, marks, digits or underscore.
 */
export function hasWordBoundaries(folded: string, start: number, end: number): boolean {
  const wordChar = /[\p{L}\p{M}\p{N}_]/u;
  const before = start > 0 ? folded[start - 1] : undefined;
  const after = end < folded.length ? folded[end] : undefined;
  if (before !== undefined && wordChar.test(before)) return false;
  if (after !== undefined && wordChar.test(after)) return false;
  return true;
}
