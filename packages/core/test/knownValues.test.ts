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

  it("does not find a value that is only part of a longer word on both sides", () => {
    expect(surfaces("aaa", { PERSON: ["aa"] })).toEqual([]);
    expect(surfaces("aa aa", { PERSON: ["aa"] })).toEqual(["aa", "aa"]);
  });
});
