import { checkExamples, createEngine } from "@determask/core";
import { describe, expect, it } from "vitest";
import { cardBrand, corePack, iban, ibanChecksum, isIPv4, isIPv6, luhn } from "../src/index.js";

const engine = createEngine({ configVersion: 1 }, { packs: [corePack] });
const found = (text: string) =>
  engine.analyze(text).findings.map((f) => `${f.entity}:${text.slice(f.start, f.end)}`);

describe("@determask/pack-core — pack contract", () => {
  it("is identified by its package name and serves every locale", () => {
    expect(corePack.id).toBe("pack-core");
    expect(corePack.locales).toEqual(["*"]);
  });

  it("ships the six documented recognizers", () => {
    expect(corePack.recognizers.map((r) => r.id)).toEqual([
      "core.email",
      "core.url",
      "core.ipv4",
      "core.ipv6",
      "core.credit-card",
      "core.iban",
    ]);
  });

  for (const r of corePack.recognizers) {
    it(`${r.id}: every embedded example holds (D20)`, () => {
      expect(checkExamples(r)).toEqual([]);
    });
  }
});

describe("end to end: a log line", () => {
  it("masks what identifies a person and leaves the rest", () => {
    const line =
      "2026-11-25T10:31:07Z user=jane.doe@acme.io ip=203.0.113.42 card=4111111111111111 " +
      "iban=DE89370400440532013000 ver 1.2.3.4 lodash@4.17.21 icon@2x.png took 12:30:45";
    const { findings } = engine.analyze(line);
    const { text } = engine.anonymize(line, findings);
    expect(text).toBe(
      "2026-11-25T10:31:07Z user=⟦EMAIL_ADDRESS_1⟧ ip=⟦IP_ADDRESS_1⟧ card=⟦CREDIT_CARD_1⟧ " +
        "iban=⟦IBAN_CODE_1⟧ ver 1.2.3.4 lodash@4.17.21 icon@2x.png took 12:30:45",
    );
  });

  it("labels a validated card with its brand", () => {
    const [f] = engine.analyze("4111111111111111").findings;
    expect(f).toMatchObject({ entity: "CREDIT_CARD", score: 1, attrs: { brand: "visa" } });
  });

  it("masks a URL carrying an email as ONE region, labelled by the stronger finding", () => {
    const text = "see https://x.io/?to=jane@acme.io now";
    const { text: masked, map } = engine.anonymize(text, engine.analyze(text).findings);
    expect(masked).toBe("see ⟦EMAIL_ADDRESS_1⟧ now"); // email 0.9 outranks URL 0.6
    expect(map["⟦EMAIL_ADDRESS_1⟧"]).toBe("https://x.io/?to=jane@acme.io"); // the whole URL
  });
});

describe("identifiers glued to labels, and in other scripts' digits", () => {
  it("finds a card or an IP written straight after its label", () => {
    expect(found("card4111111111111111")).toEqual(["CREDIT_CARD:4111111111111111"]);
    expect(found("IP203.0.113.42")).toEqual(["IP_ADDRESS:203.0.113.42"]);
  });

  it("finds an email or URL glued to Japanese or Chinese text", () => {
    expect(found("連絡先はtaro@example.comです")).toEqual(["EMAIL_ADDRESS:taro@example.com"]);
    expect(found("详情见https://example.com/a 页面")).toEqual(["URL:https://example.com/a"]);
  });

  it("finds a card written in Arabic-Indic or Devanagari digits", () => {
    expect(found("بطاقة ٤١١١١١١١١١١١١١١١")).toEqual(["CREDIT_CARD:٤١١١١١١١١١١١١١١١"]);
    expect(found("कार्ड ४१११ ११११ ११११ ११११")).toEqual(["CREDIT_CARD:४१११ ११११ ११११ ११११"]);
  });
});

describe("IBAN — candidate ends at group boundaries", () => {
  it("does not swallow a following word that looks like a group", () => {
    expect(found("pay BE68 5390 0754 7034 from Monday")).toEqual(["IBAN_CODE:BE68 5390 0754 7034"]);
  });

  it("stops at punctuation and at a double space", () => {
    expect(found("iban: GB29NWBK60161331926819, ok")).toEqual(["IBAN_CODE:GB29NWBK60161331926819"]);
    expect(found("NL91 ABNA 0417 1643 00  x")).toEqual(["IBAN_CODE:NL91 ABNA 0417 1643 00"]);
  });

  it("finds several IBANs in one text", () => {
    expect(found("DE89370400440532013000 and RS35260005601001611379")).toHaveLength(2);
  });

  it("does not run past 34 characters", () => {
    expect(found(`DE89370400440532013000${"1".repeat(40)}`)).toEqual([]);
  });

  it("reports nothing for a start with no valid IBAN after it, then keeps scanning", () => {
    expect(found("AB12 cdef, then DE89 3704 0044 0532 0130 00")).toEqual(["IBAN_CODE:DE89 3704 0044 0532 0130 00"]);
  });

  it("ends at the end of the text, including after a trailing space", () => {
    expect(found("RS35260005601001611379 ")).toEqual(["IBAN_CODE:RS35260005601001611379"]);
  });

  it("does not merge into the next words when a longer candidate passes the checksum by chance", () => {
    // "DE89370400440532013000ANDRS" passes MOD 97-10 by chance; taking it leaked the second IBAN
    expect(found("DE89370400440532013000 and RS35260005601001611379")).toEqual([
      "IBAN_CODE:DE89370400440532013000",
      "IBAN_CODE:RS35260005601001611379",
    ]);
  });

  it("prefers the standard print form over a longer candidate that also passes", () => {
    // "DE89370400440532013000AEY" passes MOD 97-10 too (a constructed token; no common
    // word does) — the standard form, one contiguous run, must win
    expect(found("DE89370400440532013000 aey")).toEqual(["IBAN_CODE:DE89370400440532013000"]);
  });

  it("still finds an IBAN printed in a non-standard grouping", () => {
    expect(found("IBAN DE89 37040044 0532 013000 thanks")).toEqual(["IBAN_CODE:DE89 37040044 0532 013000"]);
  });

  it("does not start inside a word", () => {
    expect(found("ibanDE89370400440532013000")).toEqual([]);
    expect(found("9DE89370400440532013000")).toEqual(["IBAN_CODE:DE89370400440532013000"]);
  });

  it("exposes its start pattern for the ReDoS gate", () => {
    expect(iban.patterns).toEqual([{ name: "start", regex: "[a-z]{2}\\d{2}" }]);
  });
});

describe("luhn — ISO/IEC 7812-1 Annex B", () => {
  it("accepts the standard example and the networks' test numbers", () => {
    for (const n of ["79927398713", "4111111111111111", "5555555555554444", "378282246310005"]) {
      expect(luhn(n), n).toBe(true);
    }
  });

  it("rejects a changed digit and anything that is not digits", () => {
    expect(luhn("79927398710")).toBe(false);
    expect(luhn("4111111111111112")).toBe(false);
    expect(luhn("4111-1111")).toBe(false);
    expect(luhn("")).toBe(false);
  });
});

describe("cardBrand — published IIN ranges", () => {
  const cases: [string, string | undefined][] = [
    ["4111111111111", "visa"],
    ["4111111111111111", "visa"],
    ["4111111111111111110", "visa"],
    ["41111111111111", undefined], // Visa, wrong length
    ["5555555555554444", "mastercard"],
    ["2223000048400011", "mastercard"],
    ["2721000000000000", undefined], // just past the 2-series range
    ["555555555555444", undefined], // Mastercard, wrong length
    ["378282246310005", "amex"],
    ["341111111111111", "amex"],
    ["3782822463100050", undefined], // Amex, wrong length
    ["6011111111111117", "discover"],
    ["6440000000000000", "discover"],
    ["6500000000000000", "discover"],
    ["6011111111111", undefined], // Discover, too short
    ["3530111333300000", "jcb"],
    ["353011133330000", undefined], // JCB, too short
    ["30569309025904", "diners"],
    ["36000000000000", "diners"],
    ["3056930902590", undefined], // Diners, too short
    ["6200000000000005", "unionpay"],
    ["620000000000000", undefined], // UnionPay, too short
    ["1234567812345670", undefined],
  ];
  for (const [digits, brand] of cases) {
    it(`${digits} → ${brand ?? "unknown"}`, () => {
      expect(cardBrand(digits)).toBe(brand);
    });
  }
});

describe("ibanChecksum — ISO 13616-1 / ISO 7064 MOD 97-10", () => {
  it("accepts the SWIFT registry examples, in any case", () => {
    for (const v of [
      "DE89370400440532013000",
      "GB29NWBK60161331926819",
      "NL91ABNA0417164300",
      "BE68539007547034",
      "FR1420041010050500013M02606",
      "RS35260005601001611379",
      "de89370400440532013000",
    ]) {
      expect(ibanChecksum(v), v).toBe(true);
    }
  });

  it("rejects a changed digit and malformed structure", () => {
    expect(ibanChecksum("DE89370400440532013001")).toBe(false);
    expect(ibanChecksum("DE8937040044")).toBe(false); // too short
    expect(ibanChecksum("1E89370400440532013000")).toBe(false); // country not letters
    expect(ibanChecksum("DE893704004405320130000000000000000")).toBe(false); // too long
  });
});

describe("isIPv4 — RFC 791", () => {
  it("accepts four octets in range", () => {
    expect(isIPv4("0.0.0.0")).toBe(true);
    expect(isIPv4("255.255.255.255")).toBe(true);
  });
  it("rejects octets out of range, wrong counts and non-digits", () => {
    for (const s of ["256.1.1.1", "1.2.3", "1.2.3.4.5", "1.2.3.a", "1..2.3", "1234.1.1.1"]) {
      expect(isIPv4(s), s).toBe(false);
    }
  });
});

describe("isIPv6 — RFC 4291 §2.2", () => {
  it("accepts full and compressed forms", () => {
    for (const s of ["2001:db8:0:0:0:0:2:1", "2001:db8::2:1", "::1", "fe80::", "::ffff:c000:280"]) {
      expect(isIPv6(s), s).toBe(true);
    }
  });
  it("rejects malformed forms", () => {
    for (const s of [
      "::", // no group at all
      ":::1", // triple colon
      "1::2::3", // two compressions
      "1:2:3:4:5:6:7", // seven groups, no compression
      "1:2:3:4:5:6:7:8:9", // nine groups
      "1::2:3:4:5:6:7:8", // compression with eight groups
      "12345::1", // group too long
      "g::1", // not hex
    ]) {
      expect(isIPv6(s), s).toBe(false);
    }
  });
});
