import { checkExamples, createEngine } from "@determask/core";
import { describe, expect, it } from "vitest";
import { isMyKadDate, MYKAD_PB_CODES, myPack } from "../src/index.js";

// Every identifier below is synthetic: built from the structure, not taken
// from a person.
const engine = createEngine({ configVersion: 1, locales: { primary: "ms-MY" } }, { packs: [myPack] });
const found = (text: string) =>
  engine.analyze(text).findings.map((f) => `${f.entity}:${text.slice(f.start, f.end)}`);
const masked = (text: string) => engine.anonymize(text, engine.analyze(text).findings).text;

describe("@determask/pack-my — pack contract", () => {
  it("is identified by its package name and serves ms-MY and en-MY", () => {
    expect(myPack.id).toBe("pack-my");
    expect(myPack.locales).toEqual(["ms-MY", "en-MY"]);
  });

  it("ships the three documented recognizers", () => {
    expect(myPack.recognizers.map((r) => r.id)).toEqual(["my.nric", "my.phone", "my.passport"]);
  });

  for (const r of myPack.recognizers) {
    it(`${r.id}: every embedded example holds (D20)`, () => {
      expect(checkExamples(r)).toEqual([]);
    });
  }

  it("runs for en-MY too, and not for a locale another loaded pack is made for", () => {
    expect(engine.analyze("IC 850615-14-2468", { locale: "en-MY" }).findings).toHaveLength(1);
    const withVi = createEngine(
      { configVersion: 1 },
      { packs: [myPack], recognizers: [{ id: "t.other", entities: ["OTHER"], locales: ["vi-VN"], analyze: () => [] }] },
    );
    expect(withVi.analyze("IC 850615-14-2468", { locale: "vi-VN" }).findings).toEqual([]);
  });
});

describe("end to end: a synthetic clinic note", () => {
  const note =
    "Pesakit Nur Aisyah binti Rahman, No. KP 850615-14-2468, h/p 012-345 6789. " +
    "Waris: suami, tel +60 11-2345 6789; rumah (03) 2345 6789. Passport A12345678. " +
    "BP 132/84 mmHg, HbA1c 7.2%, glukosa 6.8 mmol/L, no. invois 850615142469.";

  it("masks the IC, phones and passport, and keeps the vitals and the invoice number", () => {
    const { findings } = engine.analyze(note, { knownValues: { PERSON: ["Nur Aisyah binti Rahman"] } });
    const { text, map } = engine.anonymize(note, findings);
    expect(text).toBe(
      "Pesakit ⟦PERSON_1⟧, No. KP ⟦MY_NRIC_1⟧, h/p ⟦PHONE_NUMBER_1⟧. " +
        "Waris: suami, tel ⟦PHONE_NUMBER_2⟧; rumah ⟦PHONE_NUMBER_3⟧. Passport ⟦MY_PASSPORT_1⟧. " +
        "BP 132/84 mmHg, HbA1c 7.2%, glukosa 6.8 mmol/L, no. invois 850615142469.",
    );
    expect(engine.restore(text, map)).toBe(note);
  });

  it("masks an English dictation whose speech-to-text spaced the IC and ran the phone together", () => {
    const dictation = "Patient's IC is 850615 14 2468, mobile 0123456789, clinic 04-234 5678. Temp 37.8, SpO2 97%.";
    const { findings } = engine.analyze(dictation, { locale: "en-MY" });
    const { text, map } = engine.anonymize(dictation, findings);
    expect(text).toBe(
      "Patient's IC is ⟦MY_NRIC_1⟧, mobile ⟦PHONE_NUMBER_1⟧, clinic ⟦PHONE_NUMBER_2⟧. Temp 37.8, SpO2 97%.",
    );
    expect(engine.restore(text, map)).toBe(dictation);
  });
});

describe("MY_NRIC — the MyKad number", () => {
  it("finds the same number with hyphens, with spaces and as one run, and masks it without context", () => {
    for (const ic of ["850615-14-2468", "850615 14 2468", "850615142468", "850615-14 2468"]) {
      const [finding, ...rest] = engine.analyze(`dirujuk ${ic} semalam`).findings;
      expect(rest, ic).toEqual([]);
      expect(finding, ic).toMatchObject({
        entity: "MY_NRIC",
        score: 0.85,
        attrs: { date: "valid", pbCode: "listed" },
      });
    }
  });

  it("reaches full score next to an IC word", () => {
    expect(engine.analyze("No. KP 850615-14-2468").findings[0]).toMatchObject({ score: 1 });
  });

  it("does not mask twelve digits that open with no real date", () => {
    for (const s of ["991332142468", "850230142468", "850431142468", "850001142468", "850100142468", "010229142468"]) {
      expect(found(s), s).toEqual([]);
    }
  });

  it("accepts 29 February in leap years, including 2000", () => {
    expect(found("000229142468")).toEqual(["MY_NRIC:000229142468"]);
    expect(found("040229142468")).toEqual(["MY_NRIC:040229142468"]);
  });

  it("still masks an impossible date next to an IC word — a mistyped IC is still the patient's", () => {
    const [finding] = engine.analyze("IC 991332-14-2468").findings;
    expect(finding).toMatchObject({ entity: "MY_NRIC", score: 0.55, attrs: { date: "invalid" } });
  });

  it("fails closed on a PB code JPN does not list: masked at 0.6 and marked unlisted", () => {
    for (const pb of ["00", "17", "20", "69", "70", "73", "80", "81", "94", "97"]) {
      const [finding] = engine.analyze(`850615-${pb}-2468`).findings;
      expect(finding, pb).toMatchObject({ score: 0.6, attrs: { date: "valid", pbCode: "unlisted" } });
    }
    expect(engine.analyze("MyKad 850615-17-2468").findings[0]!.score).toBeCloseTo(0.95);
  });

  it("treats state codes, country codes and 'state unknown' (82) alike", () => {
    for (const pb of ["01", "16", "21", "59", "60", "71", "72", "82", "93", "98", "99"]) {
      expect(engine.analyze(`850615-${pb}-2468`).findings[0], pb).toMatchObject({
        score: 0.85,
        attrs: { pbCode: "listed" },
      });
    }
  });

  it("can be made strict per entity: only listed codes, or an IC word, then pass", () => {
    const strict = createEngine(
      { configVersion: 1, locales: { primary: "ms-MY" }, thresholds: { perEntity: { MY_NRIC: 0.7 } } },
      { packs: [myPack] },
    );
    expect(strict.analyze("850615-17-2468").findings).toEqual([]);
    expect(strict.analyze("MyKad 850615-17-2468").findings).toHaveLength(1);
    expect(strict.analyze("850615-14-2468").findings).toHaveLength(1);
  });

  it("leaves a twelve-digit order, invoice or receipt number alone", () => {
    for (const s of [
      "Order no. 850615142468",
      "No. pesanan 850615142468",
      "Invoice 850615-14-2468",
      "no. resit: 850615142468",
      "Tracking number 850615142468",
    ]) {
      expect(found(s), s).toEqual([]);
    }
  });

  it("does not reject an IC because of a common word nearby", () => {
    // "order" alone, "pesanan" (also "message") and "akaun" (account) are not anti-context
    expect(found("Doctor's order: repeat FBC, IC 850615-14-2468")).toEqual(["MY_NRIC:850615-14-2468"]);
    expect(found("Pesanan: sila bawa IC 850615142468")).toEqual(["MY_NRIC:850615142468"]);
    expect(found("Akaun MySejahtera, IC 850615142468")).toEqual(["MY_NRIC:850615142468"]);
  });

  it("finds an IC typed straight against its label", () => {
    expect(found("IC850615142468")).toEqual(["MY_NRIC:850615142468"]);
    expect(found("No.KP850615-14-2468")).toEqual(["MY_NRIC:850615-14-2468"]);
    expect(engine.analyze("IC850615142468").findings[0]!.score).toBe(1);
  });

  it("does not take digits from a longer run, or from a +60 phone number", () => {
    expect(found("1850615142468")).toEqual([]);
    expect(found("8506151424681")).toEqual([]);
    expect(found("+601123456789").map((f) => f.split(":")[0])).toEqual(["PHONE_NUMBER"]);
  });

  it("masks twelve digits that read as both an IC and a 60-prefixed mobile either way; a nearby word picks the label", () => {
    // 60-11-2345 6789 is also 23 November 1960, PB 45 (Terengganu)
    expect(masked("601123456789")).toBe("⟦MY_NRIC_1⟧");
    expect(masked("IC 601123456789")).toBe("IC ⟦MY_NRIC_1⟧");
    expect(masked("WhatsApp 601123456789")).toBe("WhatsApp ⟦PHONE_NUMBER_1⟧");
  });
});

describe("PHONE_NUMBER (Malaysia)", () => {
  it("finds mobiles in every written form", () => {
    for (const p of [
      "012-345 6789",
      "012-3456789",
      "0123456789",
      "012 345 6789",
      "011-2345 6789",
      "+60 12-345 6789",
      "+6012-345 6789",
      "+60123456789",
      "60123456789",
      "0060 12 345 6789",
      "019.876.5432",
    ]) {
      expect(found(`hubungi ${p} segera`), p).toEqual([`PHONE_NUMBER:${p}`]);
    }
  });

  it("finds landlines, with or without the area code in brackets", () => {
    for (const p of ["03-2345 6789", "03-23456789", "+603-2345 6789", "04-234 5678", "09-765 4321", "088-234 567", "(03) 2345 6789", "(082) 234 567"]) {
      expect(found(`Pejabat: ${p}.`), p).toEqual([`PHONE_NUMBER:${p}`]);
    }
  });

  it("masks with a country code at 0.7, and higher with a phone word", () => {
    expect(engine.analyze("+60 12-345 6789").findings[0]).toMatchObject({ score: 0.7, attrs: { country: "MY" } });
    expect(engine.analyze("Tel +60 12-345 6789").findings[0]!.score).toBe(1);
  });

  it("finds a phone typed straight against its label", () => {
    expect(found("HP0123456789")).toEqual(["PHONE_NUMBER:0123456789"]);
    expect(found("Tel:+60323456789")).toEqual(["PHONE_NUMBER:+60323456789"]);
  });

  it("finds a Unicode dash where a hyphen was meant", () => {
    expect(found("012–345 6789")).toEqual(["PHONE_NUMBER:012–345 6789"]);
  });

  it("does not mask a number after an invoice or order word", () => {
    expect(found("Invoice 0123456789")).toEqual([]);
    expect(found("Order no. 03-2345 6789")).toEqual([]);
  });
});

describe("MY_PASSPORT", () => {
  it("needs a passport word", () => {
    expect(found("A12345678")).toEqual([]);
    expect(found("Passport A12345678")).toEqual(["MY_PASSPORT:A12345678"]);
    expect(found("pasport H23456789")).toEqual(["MY_PASSPORT:H23456789"]);
  });
});

describe("isMyKadDate — YYMMDD in 19YY or 20YY", () => {
  it("accepts the last day of every month", () => {
    for (const d of ["850131", "850228", "840229", "850331", "850430", "850531", "850630", "850731", "850831", "850930", "851031", "851130", "851231"]) {
      expect(isMyKadDate(d), d).toBe(true);
    }
  });

  it("rejects the day after it", () => {
    for (const d of ["850132", "850229", "840230", "850332", "850431", "850532", "850631", "850732", "850832", "850931", "851032", "851131", "851232"]) {
      expect(isMyKadDate(d), d).toBe(false);
    }
  });

  it("rejects month 00 and 13, day 00, and anything that is not six digits", () => {
    for (const d of ["850015", "851315", "850600", "85061", "8506155", "85o615"]) expect(isMyKadDate(d), d).toBe(false);
  });
});

describe("MYKAD_PB_CODES — JPN's Kod Negeri and Kod Negara", () => {
  const unlisted = ["00", "17", "18", "19", "20", "69", "70", "73", "80", "81", "94", "95", "96", "97"];

  it("holds every two-digit code except the fourteen JPN does not list", () => {
    expect(MYKAD_PB_CODES.size).toBe(86);
    for (let n = 0; n < 100; n++) {
      const code = String(n).padStart(2, "0");
      expect(MYKAD_PB_CODES.has(code), code).toBe(!unlisted.includes(code));
    }
  });
});
