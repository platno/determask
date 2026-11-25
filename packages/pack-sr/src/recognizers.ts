/**
 * Serbian recognizers. Serbian is written in Cyrillic and Latin, often both
 * in one record, so every context list carries both scripts. Patterns are
 * written against the FOLDED view (lower case, marks stripped — č, ć, š, ž
 * fold to c, c, s, z and đ to d; Cyrillic stays Cyrillic). All test values
 * are synthetic.
 */
import { patternRecognizer } from "@determask/core";
import { isJmbg, isPib, isRsAccount } from "./validators.js";

const SR = ["sr-RS", "sr-Latn-RS", "sr-Cyrl-RS"];

/** RS_PERSONAL_ID — the 13-digit JMBG: a real date of birth plus a check digit. Masked without context. */
export const jmbg = patternRecognizer({
  id: "sr.jmbg",
  entity: "RS_PERSONAL_ID",
  locales: SR,
  patterns: [{ name: "thirteen-digits", regex: "(?<!\\d)\\d{13}(?!\\d)", score: 0.9 }],
  validate: (folded) => isJmbg(folded),
  context: ["jmbg", "јмбг", "matični broj", "матични број", "jedinstveni matični broj", "lični broj", "лични број"],
  examples: {
    match: [
      "JMBG: ⟪0101990710008⟫",
      "Пацијент Петар Петровић, ЈМБГ ⟪1506005805125⟫",
      "⟪2902000710017⟫ (rođen 29.02.2000)",
    ],
    noMatch: [
      "0101990710009", // wrong check digit
      "2902999710011", // 29 February 1999 does not exist
      "3201990710000", // day 32
      "timestamp 1732521600000",
    ],
  },
});

/** RS_TAX_CODE — the 9-digit PIB, ISO 7064 MOD 11,10. Context required. */
export const pib = patternRecognizer({
  id: "sr.pib",
  entity: "RS_TAX_CODE",
  locales: SR,
  patterns: [{ name: "nine-digits", regex: "(?<!\\d)\\d{9}(?!\\d)", score: 0.3 }],
  validate: (folded) => isPib(folded),
  context: ["pib", "пиб", "poreski identifikacioni broj", "порески идентификациони број", "poreski broj"],
  examples: {
    match: ["PIB: ⟪100000008⟫", "ПИБ ⟪123456788⟫"],
    noMatch: ["100000008", "PIB 100000009"],
  },
});

/**
 * RS_BANK_ACCOUNT — 3-digit bank, up to 13-digit account, 2 control digits
 * (MOD 97-10). The dashed form is distinctive and masked anywhere; 18 bare
 * digits need context.
 */
export const bankAccount = patternRecognizer({
  id: "sr.bank-account",
  entity: "RS_BANK_ACCOUNT",
  locales: SR,
  patterns: [
    { name: "dashed", regex: "(?<![\\d-])\\d{3}-\\d{1,13}-\\d{2}(?![\\d-])", score: 0.9 },
    { name: "contiguous", regex: "(?<!\\d)\\d{18}(?!\\d)", score: 0.4 },
  ],
  validate: (folded) => isRsAccount(folded),
  context: ["račun", "рачун", "tekući račun", "текући рачун", "žiro račun", "жиро рачун", "broj računa", "број рачуна", "account"],
  examples: {
    match: [
      "Uplata na ⟪160-0000000123456-54⟫",
      "текући рачун ⟪160-123456-54⟫",
      "račun ⟪260005601001611379⟫",
    ],
    noMatch: ["160-123456-55", "260005601001611379", "2026-11-25"],
  },
});

/** RS_HEALTH_INSURANCE_NUMBER — the 11-digit LBO (lični broj osiguranika, RFZO). Context required. */
export const lbo = patternRecognizer({
  id: "sr.lbo",
  entity: "RS_HEALTH_INSURANCE_NUMBER",
  locales: SR,
  patterns: [{ name: "eleven-digits", regex: "(?<!\\d)\\d{11}(?!\\d)", score: 0.2 }],
  context: ["lbo", "лбо", "broj osiguranika", "број осигураника", "lični broj osiguranika", "лични број осигураника", "rfzo", "рфзо"],
  contextBoost: 0.4,
  examples: {
    match: ["LBO: ⟪12345678901⟫", "ЛБО ⟪10987654321⟫"],
    noMatch: ["12345678901", "račun 12345678901"],
  },
});

/** "račun" and "pib" next to a number mean it is not a phone. */
const NOT_A_PHONE = ["račun", "рачун", "broj računa", "број рачуна", "pib", "пиб", "faktura", "фактура", "porudžbina", "поруџбина"];

/**
 * PHONE_NUMBER (Serbia) — the national numbering plan (RATEL): mobiles
 * 06x + 6–7 digits, geographic numbers 01x–03x + 6–7 digits; +381 / 00381
 * instead of the leading 0; separators space, slash, dot or dash
 * (`011/123-4567` is the customary way to write a Belgrade number).
 */
export const phone = patternRecognizer({
  id: "sr.phone",
  entity: "PHONE_NUMBER",
  locales: SR,
  patterns: [
    { name: "mobile", regex: "(?<![\\d+])(?:\\+381|00381|0)[ /.-]?6\\d(?:[ /.-]?\\d){6,7}(?!\\d)", score: 0.55 },
    { name: "geographic", regex: "(?<![\\d+])(?:\\+381|00381|0)[ /.-]?[1-3]\\d(?:[ /.-]?\\d){6,7}(?!\\d)", score: 0.45 },
  ],
  context: ["tel", "telefon", "тел", "телефон", "mob", "mobilni", "моб", "мобилни", "kontakt", "контакт", "phone"],
  antiContext: NOT_A_PHONE,
  attrs: { country: "RS" },
  examples: {
    match: [
      "Mob: ⟪064 123 4567⟫",
      "тел. ⟪011/123-4567⟫",
      "⟪+381 63 123 456⟫",
      "kontakt ⟪021 456 789⟫",
    ],
    noMatch: ["račun 0641234567", "021 456 789", "06412345"],
  },
});
