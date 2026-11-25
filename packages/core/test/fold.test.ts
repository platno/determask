import { describe, expect, it } from "vitest";
import { foldText, foldValue, hasWordBoundaries } from "../src/index.js";

/** Every folded unit maps back to a real slice of the original. */
function expectOffsetsRoundTrip(original: string): void {
  const { text, starts, ends } = foldText(original);
  expect(starts).toHaveLength(text.length);
  expect(ends).toHaveLength(text.length);
  for (let i = 0; i < text.length; i++) {
    const s = starts[i] as number;
    const e = ends[i] as number;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(e).toBeGreaterThan(s);
    expect(e).toBeLessThanOrEqual(original.length);
    if (i > 0) expect(s).toBeGreaterThanOrEqual(starts[i - 1] as number);
  }
}

describe("foldText — the matching view (D4)", () => {
  it("returns an empty view for empty input", () => {
    expect(foldText("")).toEqual({ text: "", starts: [], ends: [] });
  });

  it("lower-cases and strips Vietnamese diacritics", () => {
    expect(foldText("Nguyễn Văn Ấn Ộ").text).toBe("nguyen van an o");
  });

  it("folds đ and Đ to d — they have no canonical decomposition", () => {
    expect(foldText("Đức đi").text).toBe("duc di");
  });

  it("folds decomposed (NFD) input the same as precomposed input", () => {
    expect(foldText("Nguyễn").text).toBe(foldText("Nguyễn").text);
  });

  it("folds Serbian Latin diacritics", () => {
    expect(foldText("Đorđe Šćekić Žižić").text).toBe("dorde scekic zizic");
  });

  it("folds full-width digits and letters (width folding)", () => {
    expect(foldText("０９１２ＡＢ").text).toBe("0912ab");
  });

  it("expands compatibility ligatures, mapping each unit to the source code point", () => {
    const view = foldText("ﬁle");
    expect(view.text).toBe("file");
    expect(view.starts).toEqual([0, 0, 1, 2]);
    expect(view.ends).toEqual([1, 1, 2, 3]);
  });

  it("folds every Unicode decimal digit to ASCII, whatever the script", () => {
    expect(foldText("٠٩١٢٣٤٥٦٧٨").text).toBe("0912345678"); // Arabic-Indic
    expect(foldText("۰۹۱۲۳۴۵۶۷۸").text).toBe("0912345678"); // Extended Arabic-Indic (Persian, Urdu)
    expect(foldText("०९१२३४५६७८").text).toBe("0912345678"); // Devanagari
    expect(foldText("๐๙๑๒").text).toBe("0912"); // Thai
    expect(foldText("𞥐𞥙").text).toBe("09"); // Adlam (astral)
    expect(foldText("𝟎𝟗").text).toBe("09"); // mathematical digits, via NFKD
    expect(foldText("0123456789").text).toBe("0123456789"); // ASCII untouched
  });

  it("keeps the offset map across script-folded digits", () => {
    const original = "SĐT ٠٩١٢";
    const { text, starts } = foldText(original);
    expect(text).toBe("sdt 0912");
    expect(original.slice(starts[4], starts[7]! + 1)).toBe("٠٩١٢");
  });

  it("transliterates Cyrillic to Latin on the Serbian standard, agreeing with the Latin fold", () => {
    expect(foldText("Петар Петровић").text).toBe(foldText("Petar Petrović").text);
    expect(foldText("Ђорђе Шћекић").text).toBe(foldText("Đorđe Šćekić").text);
    expect(foldText("Љубица Њего Џамић Жижић Чолић").text).toBe(foldText("Ljubica Njego Džamić Žižić Čolić").text);
    expect(foldText("ЈМБГ").text).toBe("jmbg");
    expect(foldText("матични број").text).toBe(foldText("matični broj").text);
  });

  it("gives other Cyrillic alphabets a plain matching form", () => {
    expect(foldText("Щука Юлия Ярослав объём").text).toBe("scuka julija jaroslav obem");
    expect(foldText("Єва Іван Ґанок Їжак Ѕвезда").text).toBe("jeva ivan ganok izak dzvezda");
    expect(foldText("Ѳ").text).toBe("ѳ"); // a letter with no entry is kept as it is
  });

  it("maps every unit of a multi-letter transliteration back to its source letter", () => {
    const view = foldText("Љ");
    expect(view.text).toBe("lj");
    expect(view.starts).toEqual([0, 0]);
    expect(view.ends).toEqual([1, 1]);
  });

  it("handles case mappings that change length (İ → i)", () => {
    expect(foldText("İstanbul").text).toBe("istanbul");
  });

  it("turns Unicode format characters into a space so they cannot split a value", () => {
    for (const fc of ["​", "‌", "‍", "­", "‎", "‏", "﻿", "⁠"]) {
      expect(foldText(`An${fc}Hoa`).text).toBe("an hoa");
    }
  });

  it("collapses whitespace runs, including mixed spaces, tabs, newlines and format chars", () => {
    expect(foldText("Nguyễn \t\n​  Văn").text).toBe("nguyen van");
  });

  it("keeps a single leading space (no space precedes it)", () => {
    expect(foldText(" An").text).toBe(" an");
  });

  it("maps offsets back to the ORIGINAL UTF-16 string, astral code points included (D3)", () => {
    const original = "😀 Đức";
    const view = foldText(original);
    expect(view.text).toBe("😀 duc");
    // the emoji occupies two units in both strings, and both map to [0, 2)
    expect(view.starts.slice(0, 2)).toEqual([0, 0]);
    expect(view.ends.slice(0, 2)).toEqual([2, 2]);
    const d = view.text.indexOf("duc");
    expect(original.slice(view.starts[d], view.ends[d + 2])).toBe("Đức");
  });

  it("round-trips offsets on hostile Unicode", () => {
    for (const s of [
      "Nguyễn Văn Đức",
      "😀👍🏽 Đorđe ﬁ ０９ İ",
      "​​​",
      "é́́",
      "𠀀𠀁 Hoa",
      "Ђорђе Шћекић Љубица ъ", // transliterated, one source letter to 0–2 units
      "٠٩١٢ 𞥐𞥙 𝟎",
      "\uD800 lone high, lone low \uDC00",
    ]) {
      expectOffsetsRoundTrip(s);
    }
  });
});

describe("foldValue", () => {
  it("folds like foldText and trims", () => {
    expect(foldValue("  Nguyễn  Văn An​ ")).toBe("nguyen van an");
  });

  it("folds a value of only format characters to empty", () => {
    expect(foldValue("​﻿")).toBe("");
  });
});

describe("hasWordBoundaries — Unicode-aware (D5/F5)", () => {
  it("accepts a match at the very start and the very end", () => {
    expect(hasWordBoundaries("hoa", 0, 3)).toBe(true);
  });

  it("accepts punctuation and spaces on either side", () => {
    expect(hasWordBoundaries("(hoa).", 1, 4)).toBe(true);
    expect(hasWordBoundaries("bà hoa, 67", 3, 6)).toBe(true);
  });

  it("a letter edge is glued by an adjacent letter, mark or underscore", () => {
    expect(hasWordBoundaries("mahoa", 2, 5)).toBe(false);
    expect(hasWordBoundaries("hoan", 0, 3)).toBe(false);
    expect(hasWordBoundaries("hoa_x", 0, 3)).toBe(false);
    expect(hasWordBoundaries("x_hoa", 2, 5)).toBe(false);
    expect(hasWordBoundaries("hoa\u0301", 0, 3)).toBe(false);
  });

  it("a digit edge is glued only by an adjacent digit", () => {
    expect(hasWordBoundaries("10912345678", 1, 11)).toBe(false);
    expect(hasWordBoundaries("09123456789", 0, 10)).toBe(false);
    expect(hasWordBoundaries("cccd001099012345", 4, 16)).toBe(true); // glued to its label
    expect(hasWordBoundaries("0912345678abc", 0, 10)).toBe(true);
    expect(hasWordBoundaries("user_0912345678", 5, 15)).toBe(true);
  });

  it("a letter-digit transition is a boundary in both directions", () => {
    expect(hasWordBoundaries("9hoa", 1, 4)).toBe(true);
    expect(hasWordBoundaries("hoa9", 0, 3)).toBe(true);
  });

  it("an edge that is neither letter nor digit is never glued", () => {
    expect(hasWordBoundaries("x+84", 1, 4)).toBe(true);
    expect(hasWordBoundaries("a::1", 1, 4)).toBe(true);
    expect(hasWordBoundaries("ab(", 0, 3)).toBe(true);
  });

  it("treats non-ASCII letters as letters (where ASCII \\b fails)", () => {
    expect(hasWordBoundaries("ăhoa", 1, 4)).toBe(false);
    expect(hasWordBoundaries("hoaă", 0, 3)).toBe(false);
  });

  it("reads a whole astral letter before the match, not a lone surrogate", () => {
    // U+20000 (CJK Extension B) is a letter and occupies two UTF-16 units.
    expect(hasWordBoundaries("𠀀hoa", 2, 5)).toBe(false);
    expect(hasWordBoundaries("hoa𠀀", 0, 3)).toBe(false);
  });

  it("treats an astral non-letter (emoji) as a boundary", () => {
    expect(hasWordBoundaries("😀hoa😀", 2, 5)).toBe(true);
  });

  it("handles lone surrogates without reading past the string", () => {
    expect(hasWordBoundaries("\uDC00hoa", 1, 4)).toBe(true); // lone low at index 0
    expect(hasWordBoundaries("a\uDC00hoa", 2, 5)).toBe(true); // low not preceded by a high
    expect(hasWordBoundaries("hoa\uD800", 0, 3)).toBe(true); // lone high after
  });
});
