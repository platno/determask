/**
 * Singapore recognizers. Patterns are written against the FOLDED view
 * (lower case, ASCII digits); see docs/RECOGNIZERS.md for the scoring
 * model. All test values are synthetic.
 */
import { patternRecognizer } from "@determask/core";
import { isPostalCode, nricCheckLetter } from "./validators.js";

const SG = ["en-SG"];

/**
 * SG_NRIC_FIN — prefix S/T/F/G/M, seven digits, a check letter. FAILS
 * CLOSED: a correct check letter scores 1 and says `checksum: "valid"`; any
 * other letter is still masked (0.6) and says `checksum: "unverified"`,
 * because ICA never published the algorithm, the open implementations
 * disagree on the M series, and even government examples (ICA's M1234567B,
 * PDPC's S1234567A) carry letters that do not match.
 */
export const nricFin = patternRecognizer({
  id: "sg.nric-fin",
  entity: "SG_NRIC_FIN",
  locales: SG,
  patterns: [{ name: "nric", regex: "(?<![a-z0-9])[stfgm]\\d{7}[a-z](?![a-z0-9])", score: 0.6 }],
  validate: (folded) =>
    nricCheckLetter(folded) === folded.slice(-1)
      ? { score: 1, attrs: { checksum: "valid" }, note: "check letter matches" }
      : { attrs: { checksum: "unverified" }, note: "check letter does not match — masked anyway (fail closed)" },
  context: ["nric", "fin", "ic no", "ic number", "identity card"],
  examples: {
    match: [
      "NRIC: ⟪S1234567D⟫",
      "Patient ⟪T1234567J⟫, FIN holder spouse ⟪G1234567X⟫",
      "Work pass ⟪M1234567K⟫ and ⟪F1234567N⟫",
      "⟪M1000007J⟫", // M series, remainder 8 — the disputed case
      "ICA sample ⟪M1234567B⟫, PDPC sample ⟪S1234567A⟫", // wrong letters: masked anyway
    ],
    noMatch: ["S123456D", "AS1234567D", "S1234567DX", "X1234567D"],
  },
});

/**
 * SG_POSTAL_CODE — six digits, sector 01–82. Each code names one building,
 * so it is masked — but six bare digits are everywhere, so it needs an
 * address word, or the `S(123456)` form.
 */
export const postalCode = patternRecognizer({
  id: "sg.postal-code",
  entity: "SG_POSTAL_CODE",
  locales: SG,
  patterns: [
    { name: "six-digits", regex: "(?<!\\d)\\d{6}(?!\\d)", score: 0.2 },
    { name: "s-form", regex: "(?<![a-z0-9])s\\(\\d{6}\\)", score: 0.7 },
  ],
  validate: (folded) => isPostalCode(folded.replace(/\D/g, "")),
  context: ["singapore", "s'pore", "postal code", "postal", "blk", "block", "road", "avenue", "street", "drive", "crescent"],
  contextBoost: 0.4,
  examples: {
    match: ["Blk 123 Tampines Street 11, Singapore ⟪521123⟫", "Postal code ⟪238823⟫", "⟪S(089059)⟫"],
    noMatch: ["521123", "Singapore 991234", "order 238823"],
  },
});

/** The number belongs to an order, receipt or reference, not to a person. */
const NOT_A_PHONE = ["invoice", "order", "order no", "receipt", "ref", "ref no", "reference", "transaction"];

/**
 * PHONE_NUMBER (Singapore) — eight digits starting 3 (VoIP), 6 (fixed),
 * 8 or 9 (mobile), per IMDA's National Numbering Plan; +65 / 0065 optional.
 * With the country code it is masked anywhere; eight bare digits need a
 * phone word.
 */
export const phone = patternRecognizer({
  id: "sg.phone",
  entity: "PHONE_NUMBER",
  locales: SG,
  patterns: [
    { name: "international", regex: "(?<![\\d+])(?:\\+65|0065)[ -]?[3689]\\d{3}[ -]?\\d{4}(?!\\d)", score: 0.7 },
    { name: "national", regex: "(?<![\\d+])[3689]\\d{3}[ -]?\\d{4}(?!\\d)", score: 0.4 },
  ],
  context: ["tel", "phone", "mobile", "hp", "h/p", "handphone", "contact", "whatsapp", "call"],
  antiContext: NOT_A_PHONE,
  attrs: { country: "SG" },
  examples: {
    match: ["⟪+65 9123 4567⟫", "HP: ⟪9123 4567⟫", "contact ⟪6123-4567⟫", "WhatsApp ⟪81234567⟫"],
    noMatch: ["91234567", "order 9123 4567", "Tel 1234 5678", "+65 5123 4567"],
  },
});

/** SG_PASSPORT — a letter (E, K), seven digits, a letter. Context required. */
export const passport = patternRecognizer({
  id: "sg.passport",
  entity: "SG_PASSPORT",
  locales: SG,
  patterns: [{ name: "passport", regex: "(?<![a-z0-9])[ek]\\d{7}[a-z](?![a-z0-9])", score: 0.3 }],
  context: ["passport", "passport no", "pp no"],
  examples: {
    match: ["Passport no. ⟪E1234567A⟫", "passport ⟪K7654321Z⟫"],
    noMatch: ["E1234567A", "passport A1234567B"],
  },
});
