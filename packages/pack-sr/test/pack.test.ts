import { checkExamples, createEngine } from "@determask/core";
import { describe, expect, it } from "vitest";
import { isJmbg, isPib, isRsAccount, srPack } from "../src/index.js";

const engine = createEngine({ configVersion: 1, locales: { primary: "sr-RS" } }, { packs: [srPack] });
const found = (text: string, locale?: string) =>
  engine
    .analyze(text, locale === undefined ? {} : { locale })
    .findings.map((f) => `${f.entity}:${text.slice(f.start, f.end)}`);

describe("@determask/pack-sr — pack contract", () => {
  it("is identified by its package name and serves Serbian in both scripts", () => {
    expect(srPack.id).toBe("pack-sr");
    expect(srPack.locales).toEqual(["sr-RS", "sr-Latn-RS", "sr-Cyrl-RS"]);
  });

  it("ships the five documented recognizers", () => {
    expect(srPack.recognizers.map((r) => r.id)).toEqual(["sr.jmbg", "sr.pib", "sr.bank-account", "sr.lbo", "sr.phone"]);
  });

  for (const r of srPack.recognizers) {
    it(`${r.id}: every embedded example holds (D20)`, () => {
      expect(checkExamples(r)).toEqual([]);
    });
  }

  it("serves the script-specific locale tags too", () => {
    expect(found("JMBG 0101990710008", "sr-Cyrl-RS")).toEqual(["RS_PERSONAL_ID:0101990710008"]);
    expect(found("JMBG 0101990710008", "sr-Latn-RS")).toEqual(["RS_PERSONAL_ID:0101990710008"]);
    expect(found("JMBG 0101990710008", "vi-VN")).toEqual([]);
  });
});

describe("end to end: a synthetic record in both scripts", () => {
  const record =
    "Pacijent: Petar Petrović, JMBG 0101990710008, LBO 12345678901, mob. 064 123 4567. " +
    "Пацијент: Петар Петровић, ЈМБГ 0101990710008, тел. 011/123-4567, рачун 160-123456-54. " +
    "TA 120/80 mmHg, temperatura 37,2 °C, faktura 0641234567.";

  it("masks every identifier in Latin and Cyrillic, and keeps vitals and the invoice number", () => {
    const { findings } = engine.analyze(record, {
      knownValues: { PERSON: ["Petar Petrović", "Петар Петровић"] },
    });
    const { text, map } = engine.anonymize(record, findings);
    expect(text).toBe(
      "Pacijent: ⟦PERSON_1⟧, JMBG ⟦RS_PERSONAL_ID_1⟧, LBO ⟦RS_HEALTH_INSURANCE_NUMBER_1⟧, mob. ⟦PHONE_NUMBER_1⟧. " +
        "Пацијент: ⟦PERSON_2⟧, ЈМБГ ⟦RS_PERSONAL_ID_1⟧, тел. ⟦PHONE_NUMBER_2⟧, рачун ⟦RS_BANK_ACCOUNT_1⟧. " +
        "TA 120/80 mmHg, temperatura 37,2 °C, faktura 0641234567.",
    );
    expect(engine.restore(text, map)).toBe(record);
  });

  it("matches context words across the diacritic fold (č, ć, š, ž, đ)", () => {
    expect(found("tekući račun 260005601001611379")).toEqual(["RS_BANK_ACCOUNT:260005601001611379"]);
    expect(found("tekuci racun 260005601001611379")).toEqual(["RS_BANK_ACCOUNT:260005601001611379"]);
  });

  it("marks phones with their country", () => {
    expect(engine.analyze("tel 064 123 4567").findings[0]!.attrs).toEqual({ country: "RS" });
  });
});

describe("isJmbg — Zakon o jedinstvenom matičnom broju građana", () => {
  it("reproduces the standard published example", () => {
    expect(isJmbg("0101006500006")).toBe(true);
  });

  it("accepts synthetic numbers across centuries, and a leap day", () => {
    for (const j of ["0101990710008", "1506005805125", "2902000710017"]) expect(isJmbg(j), j).toBe(true);
  });

  it("uses 0 as the check digit when m is 10 or 11", () => {
    expect(isJmbg("0101990710040")).toBe(true);
    expect(isJmbg("0101990710041")).toBe(false);
  });

  it("rejects a wrong check digit", () => {
    expect(isJmbg("0101990710009")).toBe(false);
  });

  it("rejects dates that do not exist", () => {
    for (const j of [
      "2902999710019", // 29.02.1999 — not a leap year (check digit correct)
      "3201990710003", // day 32 (check digit correct)
      "0001990710005", // day 00
      "0113990710000", // month 13
      "0100990710000", // month 00
      "3104990710000", // 31 April
      "2902100710000", // 29.02.2100 — not a leap year
    ]) {
      expect(isJmbg(j), j).toBe(false);
    }
    expect(isJmbg("2902000710017")).toBe(true); // 2000 is a leap year
  });

  it("rejects wrong lengths and non-digits", () => {
    expect(isJmbg("010199071000")).toBe(false);
    expect(isJmbg("01019907100080")).toBe(false);
    expect(isJmbg("010199071000a")).toBe(false);
  });
});

describe("isPib — ISO/IEC 7064 MOD 11,10", () => {
  it("accepts a published company PIB and synthetic ones", () => {
    for (const p of ["104052135", "100000008", "123456788"]) expect(isPib(p), p).toBe(true);
  });

  it("rejects a wrong check digit and malformed input", () => {
    expect(isPib("104052136")).toBe(false);
    expect(isPib("10405213")).toBe(false);
    expect(isPib("10405213a")).toBe(false);
  });

  it("handles the s = 0 → 10 step of the algorithm", () => {
    // first digit 0 with p = 10 gives s = 0, which the standard replaces with 10
    expect(isPib("012345671")).toBe(isPibReference("012345671"));
  });
});

/** A direct transcription of ISO 7064 MOD 11,10, for cross-checking one value. */
function isPibReference(d: string): boolean {
  let p = 10;
  for (const c of d.slice(0, 8)) {
    const s = (Number(c) + p) % 10 || 10;
    p = (s * 2) % 11;
  }
  return (11 - p) % 10 === Number(d[8]);
}

describe("isRsAccount — MOD 97-10 control digits", () => {
  it("accepts the account embedded in the SWIFT registry's Serbian IBAN example", () => {
    expect(isRsAccount("260-0056010016113-79")).toBe(true);
    expect(isRsAccount("260005601001611379")).toBe(true);
  });

  it("pads the dashed form's account part to 13 digits", () => {
    expect(isRsAccount("160-123456-54")).toBe(true);
    expect(isRsAccount("160-0000000123456-54")).toBe(true);
    expect(isRsAccount("170-1-11")).toBe(true);
  });

  it("rejects a wrong control and malformed input", () => {
    expect(isRsAccount("160-123456-55")).toBe(false);
    expect(isRsAccount("16-123456-54")).toBe(false);
    expect(isRsAccount("160-12345678901234-54")).toBe(false);
    expect(isRsAccount("26000560100161137")).toBe(false);
  });
});
