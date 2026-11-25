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
 *   - every Unicode decimal digit (Arabic-Indic, Persian, Devanagari, Thai,
 *     …) becomes its ASCII digit, so a number cannot dodge detection by
 *     script (Presidio #2378 is this bug);
 *   - Cyrillic is transliterated to Latin on the Serbian standard (ђ→d,
 *     ћ/ч→c, ж→z, ш→s, џ→dz, љ→lj, њ→nj …), so `Петар Петровић` and
 *     `Petar Petrović` fold to the same text and match each other;
 *   - whitespace runs collapse to a single space.
 *
 * Every folded code unit maps back to the original code point that
 * produced it, so matches on the folded view yield original offsets (D3).
 */
import type { FoldedView } from "./types.js";

const FORMAT_CHAR = /^\p{Cf}$/u;
const MARKS = /\p{M}+/gu;
const WHITESPACE = /^\s$/u;
const NON_ASCII_DIGIT = /(?![0-9])\p{Nd}/gu;

/**
 * Cyrillic → Latin, after lower-casing and stripping marks. Serbian is
 * exact and agrees with the Latin fold (č, ć → c; š → s; ž → z; đ → d;
 * dž → dz). Letters of other Cyrillic alphabets get a plain matching form;
 * й, ё, ї, ѓ, ќ, ў need no entry — their marks are already stripped.
 * ъ and ь fold to nothing.
 */
const CYRILLIC: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "d", е: "e", ж: "z", з: "z", и: "i", ј: "j",
  к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t",
  ћ: "c", у: "u", ф: "f", х: "h", ц: "c", ч: "c", џ: "dz", ш: "s",
  ы: "y", э: "e", ю: "ju", я: "ja", щ: "sc", ъ: "", ь: "", є: "je", і: "i", ґ: "g", ѕ: "dz",
};
const CYRILLIC_LETTER = /[\u0400-\u04ff]/gu;

const digitValues = new Map<number, string>();

/**
 * The ASCII digit for a Unicode decimal digit. Unicode encodes every
 * decimal digit set as ten consecutive code points, 0 to 9, so the value
 * is the distance to the start of the run, mod 10 (adjacent sets keep the
 * count aligned).
 */
function asciiDigit(ch: string): string {
  const cp = ch.codePointAt(0) as number;
  let value = digitValues.get(cp);
  if (value === undefined) {
    let steps = 0;
    while (/\p{Nd}/u.test(String.fromCodePoint(cp - steps - 1))) steps++;
    value = String(steps % 10);
    digitValues.set(cp, value);
  }
  return value;
}

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
        .replaceAll("đ", "d") // đ (from đ or lower-cased Đ)
        .replace(NON_ASCII_DIGIT, asciiDigit)
        .replace(CYRILLIC_LETTER, (c) => CYRILLIC[c] ?? c);
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
 * Unicode-aware boundary check (D5/F5) on the folded text: does [start,
 * end) stand on its own, or is it the middle of a longer token?
 *
 * The rule is per edge, by the class of the character at the edge:
 *   - a LETTER (or mark) edge is glued by an adjacent letter, mark or
 *     underscore — "Hoa" is not a match inside "Hoàng" or "hoa_x";
 *   - a DIGIT edge is glued only by an adjacent digit — "0912345678" is
 *     not a match inside "10912345678", but IS one in "SĐT0912345678";
 *   - any other edge (punctuation, symbol, space) is never glued.
 * A letter–digit transition is therefore a boundary: identifiers are
 * written glued to their labels ("CCCD001099012345", "MST0100109106"),
 * and treating that as one word would leak them.
 */
export function hasWordBoundaries(folded: string, start: number, end: number): boolean {
  const before = codePointBefore(folded, start);
  const after = codePointFrom(folded, end);
  const first = codePointFrom(folded, start);
  const last = codePointBefore(folded, end);
  if (before !== undefined && first !== undefined && glued(first, before)) return false;
  if (after !== undefined && last !== undefined && glued(last, after)) return false;
  return true;
}

const LETTER = /^[\p{L}\p{M}]$/u;
const NUMBER = /^\p{N}$/u;

/** Does `neighbour` continue the token whose edge character is `edge`? */
function glued(edge: string, neighbour: string): boolean {
  if (LETTER.test(edge)) return LETTER.test(neighbour) || neighbour === "_";
  if (NUMBER.test(edge)) return NUMBER.test(neighbour);
  return false;
}

/**
 * The whole code point ending at `i` — both halves of a surrogate pair, so
 * an astral letter (CJK Extension B, Deseret, …) next to a match is a
 * letter, not a lone surrogate that would read as a boundary.
 */
function codePointBefore(s: string, i: number): string | undefined {
  if (i <= 0) return undefined;
  const low = s.charCodeAt(i - 1);
  if (low >= 0xdc00 && low <= 0xdfff && i >= 2) {
    const high = s.charCodeAt(i - 2);
    if (high >= 0xd800 && high <= 0xdbff) return s.slice(i - 2, i);
  }
  return s.slice(i - 1, i);
}

/** The whole code point starting at `i`. */
function codePointFrom(s: string, i: number): string | undefined {
  if (i >= s.length) return undefined;
  return String.fromCodePoint(s.codePointAt(i) as number);
}
