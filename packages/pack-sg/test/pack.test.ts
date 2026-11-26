import { checkExamples, createEngine } from "@determask/core";
import { describe, expect, it } from "vitest";
import { isPostalCode, nricCheckLetter, sgPack } from "../src/index.js";

const engine = createEngine({ configVersion: 1, locales: { primary: "en-SG" } }, { packs: [sgPack] });
const found = (text: string) =>
  engine.analyze(text).findings.map((f) => `${f.entity}:${text.slice(f.start, f.end)}`);

describe("@determask/pack-sg — pack contract", () => {
  it("is identified by its package name and serves en-SG", () => {
    expect(sgPack.id).toBe("pack-sg");
    expect(sgPack.locales).toEqual(["en-SG"]);
  });

  it("ships the four documented recognizers", () => {
    expect(sgPack.recognizers.map((r) => r.id)).toEqual(["sg.nric-fin", "sg.postal-code", "sg.phone", "sg.passport"]);
  });

  for (const r of sgPack.recognizers) {
    it(`${r.id}: every embedded example holds (D20)`, () => {
      expect(checkExamples(r)).toEqual([]);
    });
  }
});

describe("the label nearest the value decides", () => {
  it("masks a phone whose own label is nearer than an earlier anti-context word", () => {
    expect(found("Invoice sent to the patient, HP 9123 4567")).toEqual(["PHONE_NUMBER:9123 4567"]);
  });
});

describe("end to end: a synthetic clinic record", () => {
  const record =
    "Patient Tan Wei Ling, NRIC S1234567D, HP 9123 4567, " +
    "address Blk 123 Tampines Street 11, Singapore 521123. " +
    "BP 128/84 mmHg, HbA1c 6.1%, ref no 91234567.";

  it("masks the NRIC, phone and postal code, and keeps the vitals and the reference number", () => {
    const { findings } = engine.analyze(record, { knownValues: { PERSON: ["Tan Wei Ling"] } });
    const { text, map } = engine.anonymize(record, findings);
    expect(text).toBe(
      "Patient ⟦PERSON_1⟧, NRIC ⟦SG_NRIC_FIN_1⟧, HP ⟦PHONE_NUMBER_1⟧, " +
        "address Blk 123 Tampines Street 11, Singapore ⟦SG_POSTAL_CODE_1⟧. " +
        "BP 128/84 mmHg, HbA1c 6.1%, ref no 91234567.",
    );
    expect(engine.restore(text, map)).toBe(record);
  });

  it("says whether an NRIC's check letter was verified, and masks it either way", () => {
    const [valid] = engine.analyze("S1234567D").findings;
    const [wrong] = engine.analyze("S1234567A").findings;
    expect(valid).toMatchObject({ score: 1, attrs: { checksum: "valid" } });
    expect(wrong).toMatchObject({ score: 0.6, attrs: { checksum: "unverified" } });
  });

  it("finds a phone or postal code typed straight against its label", () => {
    expect(found("HP91234567")).toEqual(["PHONE_NUMBER:91234567"]);
    expect(found("Singapore521123")).toEqual(["SG_POSTAL_CODE:521123"]);
    expect(found("Tel:+6591234567")).toEqual(["PHONE_NUMBER:+6591234567"]);
  });

  it("marks phones with their country", () => {
    expect(engine.analyze("+65 9123 4567").findings[0]!.attrs).toEqual({ country: "SG" });
  });

  it("does not run for another locale", () => {
    expect(engine.analyze("NRIC S1234567D", { locale: "vi-VN" }).findings).toEqual([]);
  });
});

describe("nricCheckLetter", () => {
  it("computes the letter for every series", () => {
    expect(nricCheckLetter("s1234567d")).toBe("d");
    expect(nricCheckLetter("t1234567j")).toBe("j");
    expect(nricCheckLetter("f1234567n")).toBe("n");
    expect(nricCheckLetter("g1234567x")).toBe("x");
    expect(nricCheckLetter("m1234567k")).toBe("k");
  });

  it("follows the documented M-series table at the disputed remainder 8 (J, not M)", () => {
    expect(nricCheckLetter("m1000007j")).toBe("j");
  });

  it("returns undefined for anything that is not NRIC-shaped", () => {
    for (const s of ["a1234567d", "s123456d", "s12345678", "S1234567D"]) expect(nricCheckLetter(s), s).toBeUndefined();
  });
});

describe("isPostalCode — sectors 01–82", () => {
  it("accepts the first and last sectors", () => {
    expect(isPostalCode("018956")).toBe(true);
    expect(isPostalCode("828761")).toBe(true);
  });

  it("rejects sector 00, sectors above 82, and malformed input", () => {
    for (const s of ["001234", "831234", "991234", "12345", "1234567", "12345a"]) expect(isPostalCode(s), s).toBe(false);
  });
});
