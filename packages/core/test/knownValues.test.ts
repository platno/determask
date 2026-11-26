import { describe, expect, it } from "vitest";
import { foldText, KNOWN_VALUES_RECOGNIZER_ID, matchKnownValues, type TextViews } from "../src/index.js";

const views = (original: string): TextViews => ({ original, folded: foldText(original) });

const surfaces = (text: string, values: Record<string, string[]>): string[] =>
  matchKnownValues(views(text), values).map((s) => text.slice(s.start, s.end));

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

  describe("in scripts written without spaces", () => {
    it("matches a Japanese name glued to its honorific and particle", () => {
      expect(surfaces("田中太郎さんは本日来院。田中太郎の電話", { PERSON: ["田中太郎"] })).toEqual(["田中太郎", "田中太郎"]);
    });

    it("matches a Korean name glued to its particle, but not as part of another name", () => {
      expect(surfaces("김민수님이 왔다. 김민수의 번호", { PERSON: ["김민수"] })).toEqual(["김민수", "김민수"]);
      expect(surfaces("김민숙님이 왔다", { PERSON: ["김민수"] })).toEqual([]);
    });

    it("matches a Chinese or Thai name inside an unspaced sentence", () => {
      expect(surfaces("患者张伟今天来院，张伟的身份证", { PERSON: ["张伟"] })).toEqual(["张伟", "张伟"]);
      expect(surfaces("คุณสมชายมาโรงพยาบาล", { PERSON: ["สมชาย"] })).toEqual(["สมชาย"]);
    });

    it("matches a Latin name glued to Chinese, and still not inside a Latin word", () => {
      expect(surfaces("Anna的电话", { PERSON: ["Anna"] })).toEqual(["Anna"]);
      expect(surfaces("Banana and Ana", { PERSON: ["Ana"] })).toEqual(["Ana"]);
    });
  });
});
