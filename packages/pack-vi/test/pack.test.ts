import { checkExamples, createEngine } from "@determask/core";
import { describe, expect, it } from "vitest";
import { CCCD_PROVINCE_CODES, isCccd, isMst, viPack } from "../src/index.js";

const engine = createEngine({ configVersion: 1, locales: { primary: "vi-VN" } }, { packs: [viPack] });
const found = (text: string) =>
  engine.analyze(text).findings.map((f) => `${f.entity}:${text.slice(f.start, f.end)}`);

describe("@determask/pack-vi — pack contract", () => {
  it("is identified by its package name and serves vi-VN", () => {
    expect(viPack.id).toBe("pack-vi");
    expect(viPack.locales).toEqual(["vi-VN"]);
  });

  it("ships the six documented recognizers", () => {
    expect(viPack.recognizers.map((r) => r.id)).toEqual([
      "vi.personal-id",
      "vi.legacy-id-card",
      "vi.tax-code",
      "vi.health-insurance-card",
      "vi.social-insurance-number",
      "vi.phone",
    ]);
  });

  for (const r of viPack.recognizers) {
    it(`${r.id}: every embedded example holds (D20)`, () => {
      expect(checkExamples(r)).toEqual([]);
    });
  }

  it("does not run for another locale", () => {
    expect(engine.analyze("CCCD 001099012345", { locale: "sr-RS" }).findings).toEqual([]);
  });
});

describe("end to end: a synthetic clinical note", () => {
  const note =
    "Bệnh nhân Nguyễn Văn An, CCCD 001099012345, thẻ BHYT DN4010123456789, " +
    "SĐT 0912 345 678. Người nhà: con trai, zalo 0383456789. " +
    "Mạch 80 l/p, HA 120/80 mmHg, glucose 5.4 mmol/L, mã đơn hàng 079203012345.";

  it("masks every identifier and leaves vitals and the order id readable", () => {
    const { findings } = engine.analyze(note, { knownValues: { PERSON: ["Nguyễn Văn An"] } });
    const { text, map } = engine.anonymize(note, findings);
    expect(text).toBe(
      "Bệnh nhân ⟦PERSON_1⟧, CCCD ⟦VN_PERSONAL_ID_1⟧, thẻ BHYT ⟦VN_HEALTH_INSURANCE_CARD_1⟧, " +
        "SĐT ⟦PHONE_NUMBER_1⟧. Người nhà: con trai, zalo ⟦PHONE_NUMBER_2⟧. " +
        "Mạch 80 l/p, HA 120/80 mmHg, glucose 5.4 mmol/L, mã đơn hàng 079203012345.",
    );
    expect(engine.restore(text, map)).toBe(note);
  });

  it("leaves the founding research's numbers-only probe untouched", () => {
    expect(found("Invoice 0312345678, qty 1000000, ts 1732521600, glucose 5.4")).toEqual([]);
  });

  it("masks a tax code as a tax code, not as the phone it also looks like (F7)", () => {
    expect(found("MST 0791234569")).toEqual(["VN_TAX_CODE:0791234569"]);
  });

  it("does not let one number's context leak to the next (window stops at a number)", () => {
    // "CMND" is context for the 9-digit card, not for the BHXH number after it
    expect(found("CMND 012345678, 7912345678")).toEqual(["VN_LEGACY_ID_CARD:012345678"]);
  });

  it("does not reject an identifier because of a common word nearby", () => {
    // "lo" (worry) and "tài khoản" (account) are not anti-context
    expect(found("Bệnh nhân lo lắng, CCCD 001099012345")).toEqual(["VN_PERSONAL_ID:001099012345"]);
    expect(found("tài khoản Zalo 0912345678")).toEqual(["PHONE_NUMBER:0912345678"]);
  });

  it("marks phones with their country", () => {
    expect(engine.analyze("SĐT 0912345678").findings[0]!.attrs).toEqual({ country: "VN" });
  });
});

describe("isCccd — Decree 137/2015 Art. 13, Circular 59/2021 Art. 7", () => {
  it("holds exactly the 63 pre-2025 province codes", () => {
    expect(CCCD_PROVINCE_CODES.size).toBe(63);
    expect(CCCD_PROVINCE_CODES.has("001")).toBe(true); // Hà Nội
    expect(CCCD_PROVINCE_CODES.has("079")).toBe(true); // TP Hồ Chí Minh
    expect(CCCD_PROVINCE_CODES.has("096")).toBe(true); // Cà Mau
    expect(CCCD_PROVINCE_CODES.has("003")).toBe(false); // never assigned
  });

  it("accepts every century digit 0–3 and rejects the rest", () => {
    for (const d of "0123") expect(isCccd(`001${d}99012345`), d).toBe(true);
    for (const d of "456789") expect(isCccd(`001${d}99012345`), d).toBe(false);
  });

  it("rejects wrong lengths and non-digits", () => {
    expect(isCccd("00109901234")).toBe(false);
    expect(isCccd("0010990123456")).toBe(false);
    expect(isCccd("00109901234a")).toBe(false);
  });
});

describe("isMst — mod-11, weights 31 29 23 19 17 13 7 5 3", () => {
  it("accepts published enterprise codes and synthetic ones", () => {
    // public business identifiers, not personal data
    for (const c of ["0100109106", "0100686209", "0300588569", "0100000003", "0791234569"]) {
      expect(isMst(c), c).toBe(true);
    }
  });

  it("accepts a 13-digit branch code, with or without the dash", () => {
    expect(isMst("0100109106-001")).toBe(true);
    expect(isMst("0100109106001")).toBe(true);
  });

  it("rejects a wrong check digit, a remainder of 0, and malformed input", () => {
    expect(isMst("0100109107")).toBe(false);
    for (let d = 0; d <= 9; d++) expect(isMst(`100000008${d}`)).toBe(false); // remainder 0: no valid digit
    expect(isMst("010010910")).toBe(false);
    expect(isMst("01001091061")).toBe(false);
    expect(isMst("01001091a6")).toBe(false);
  });
});
