import { describe, expect, it } from "vitest";
import { foldText, KNOWN_VALUES_RECOGNIZER_ID, matchKnownValues, type TextViews } from "../src/index.js";

const views = (original: string): TextViews => ({ original, folded: foldText(original) });

const surfaces = (text: string, values: Record<string, string[]>): string[] =>
  matchKnownValues(views(text), values).map((s) => text.slice(s.start, s.end));

describe("matchKnownValues — spellings without a diacritic or as two letters (EMEA round 3)", () => {
  it("matches ß and ss, Turkish ı and i, ø, ł and þ either way", () => {
    expect(surfaces("Adresse: Hauptstrasse 15", { ADDRESS: ["Hauptstraße 15"] })).toEqual(["Hauptstrasse 15"]);
    expect(surfaces("HAUPTSTRAẞE 15", { ADDRESS: ["Hauptstrasse 15"] })).toEqual(["HAUPTSTRAẞE 15"]);
    expect(surfaces("Hasta: ISIL YILMAZ", { PERSON: ["Işıl Yılmaz"] })).toEqual(["ISIL YILMAZ"]);
    expect(surfaces("Soren Lukasz Thor", { PERSON: ["Søren", "Łukasz", "Þór"] })).toEqual(["Soren", "Lukasz", "Thor"]);
  });

  it("matches Greek capitals with a final sigma, and Arabic spelling variants", () => {
    expect(surfaces("ΟΔΥΣΣΕΑΣ", { PERSON: ["Οδυσσέας"] })).toEqual(["ΟΔΥΣΣΕΑΣ"]);
    expect(surfaces("المريض محـــمد", { PERSON: ["محمد"] })).toEqual(["محـــمد"]);
    expect(surfaces("فاطمه و مصطفي", { PERSON: ["فاطمة", "مصطفى"] })).toEqual(["فاطمه", "مصطفي"]);
  });
});

describe("matchKnownValues (D11)", () => {
  it("matches case-, accent- and whitespace-insensitively", () => {
    const text = "BN NGUYEN  VAN AN; nguyễn văn an; Nguyen​Van An";
    expect(surfaces(text, { PERSON: ["Nguyễn Văn An"] })).toEqual([
      "NGUYEN  VAN AN",
      "nguyễn văn an",
      "Nguyen​Van An",
    ]);
  });

  it("finds every occurrence in the document, not only the first", () => {
    expect(surfaces("Hoa, Hoa and Hoa.", { PERSON: ["Hoa"] })).toHaveLength(3);
  });

  it("matches a value whose accents the text has but the record does not", () => {
    expect(surfaces("Bà Trần Thị Hoa", { PERSON: ["Tran Thi Hoa"] })).toEqual(["Trần Thị Hoa"]);
  });

  it("respects Unicode word boundaries", () => {
    expect(surfaces("Mahoa, hoan, Hoa.", { PERSON: ["Hoa"] })).toEqual(["Hoa"]);
  });

  it("matches across the full-width and ligature folds, reporting original offsets", () => {
    const text = "SĐT ０９１２３４５６７８.";
    const [span] = matchKnownValues(views(text), { PHONE_NUMBER: ["0912345678"] });
    expect(text.slice(span!.start, span!.end)).toBe("０９１２３４５６７８");
  });

  it("skips values that fold to nothing (empty, spaces, format characters)", () => {
    expect(surfaces("anything at all", { PERSON: ["", "   ", "​"] })).toEqual([]);
  });

  it("reports every entity and value it was given", () => {
    const spans = matchKnownValues(views("An, 0912, Hoa"), {
      PERSON: ["An", "Hoa"],
      PHONE_NUMBER: ["0912"],
    });
    expect(spans.map((s) => s.entity).sort()).toEqual(["PERSON", "PERSON", "PHONE_NUMBER"]);
  });

  it("marks spans as certain, from the known-values recognizer, with a trace", () => {
    const [span] = matchKnownValues(views("Hoa"), { PERSON: ["Hoa"] });
    expect(span).toMatchObject({ entity: "PERSON", start: 0, end: 3, score: 1 });
    expect(span!.recognizer).toBe(KNOWN_VALUES_RECOGNIZER_ID);
    expect(span!.trace[0]!.rule).toBe("known-value");
  });

  it("matches across scripts: a Latin value finds the Cyrillic spelling, and back", () => {
    expect(surfaces("Пацијент Петар Петровић", { PERSON: ["Petar Petrović"] })).toEqual(["Петар Петровић"]);
    expect(surfaces("Pacijent Petar Petrović", { PERSON: ["Петар Петровић"] })).toEqual(["Petar Petrović"]);
  });

  it("finds a number whatever its grouping, in the text or in the record", () => {
    const text = "SĐT 0912 345 678, zalo 0912.345.678, cũ 0912-345-678, mới 0912345678";
    expect(surfaces(text, { PHONE_NUMBER: ["0912345678"] })).toHaveLength(4);
    expect(surfaces(text, { PHONE_NUMBER: ["(091) 234-5678"] })).toHaveLength(4);
  });

  it("finds a number glued to its label, and written in another script's digits", () => {
    expect(surfaces("SĐT0912345678", { PHONE_NUMBER: ["0912345678"] })).toEqual(["0912345678"]);
    expect(surfaces("هاتف ٠٩١٢٣٤٥٦٧٨", { PHONE_NUMBER: ["0912345678"] })).toEqual(["٠٩١٢٣٤٥٦٧٨"]);
  });

  it("does not find a number inside a longer one", () => {
    expect(surfaces("10912345678 and 09123456789", { PHONE_NUMBER: ["0912345678"] })).toEqual([]);
  });

  it("treats a removed separator as a boundary, so a neighbouring number is not glued on", () => {
    expect(surfaces("Giường 12 0912345678", { PHONE_NUMBER: ["0912345678"] })).toEqual(["0912345678"]);
    expect(surfaces("0912345678 99", { PHONE_NUMBER: ["0912345678"] })).toEqual(["0912345678"]);
  });

  it("keeps a leading + outside the match", () => {
    expect(surfaces("+84 912 345 678", { PHONE_NUMBER: ["84912345678"] })).toEqual(["84 912 345 678"]);
  });

  it("matches short numbers and numbers with letters as ordinary words", () => {
    expect(surfaces("room 12345, room 12 345", { ROOM: ["12345"] })).toEqual(["12345"]); // under 6 digits
    expect(surfaces("MRN A-123456 and A123456", { MRN: ["A-123456"] })).toEqual(["A-123456"]); // has a letter
  });

  it("does not find a value that is only part of a longer word on both sides", () => {
    expect(surfaces("aaa", { PERSON: ["aa"] })).toEqual([]);
    expect(surfaces("aa aa", { PERSON: ["aa"] })).toEqual(["aa", "aa"]);
  });
});
