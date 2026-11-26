/**
 * Malaysian recognizers. Patterns are written against the FOLDED view
 * (lower case, ASCII digits); see docs/RECOGNIZERS.md for the scoring
 * model. All test values are synthetic.
 */
import { patternRecognizer, type ValidatorResult } from "@determask/core";
import { isMyKadDate, MYKAD_PB_CODES } from "./validators.js";

const MY = ["ms-MY", "en-MY"];

/**
 * A hyphen in any of its Unicode forms — U+2010–U+2015 and the minus sign
 * U+2212, which word processors and phone keyboards substitute for "-".
 * The folded view does not turn them into "-", so the class names them.
 */
const DASH = "\\-\\u2010-\\u2015\\u2212";

/**
 * Words that mean the number after them belongs to an invoice, an order, a
 * receipt or a parcel — not to a person. ⛔ Keep these SPECIFIC: an
 * anti-context word rejects the candidate even when an IC or phone word
 * sits closer to the value, so a common word here is a leak. Deliberately
 * NOT here: "order" and "pesanan" alone ("doctor's order"; "pesanan" is also
 * "message"), "tracking" alone, the period-less "order no" ("order no
 * further tests"), and "akaun" / "account" — a bank account number is
 * personal data too, and masking it as an IC or a phone is the safe
 * direction.
 */
const NOT_PERSONAL = [
  "invoice", "invois", "order no.", "order number", "order id", "no. pesanan", "nombor pesanan",
  "receipt no.", "no. resit", "nombor resit", "tracking no.", "tracking number",
];

/** Between the MyKad's groups: nothing, one space, or a dash with optional spaces. */
const NRIC_SEP = `(?: ?[${DASH}] ?| )?`;

/**
 * Grade a MyKad candidate. There is no check digit, so the structure is
 * what is checked (sources in validators.ts):
 *   - a real date of birth and a PB code on JPN's list: 0.85, masked anywhere;
 *   - a real date, a PB code JPN does not list: still masked (0.6) —
 *     FAIL CLOSED, because the list has grown before and a stale copy must
 *     not let a new number through;
 *   - no such date: 0.2, so twelve bare digits are left alone, but next to
 *     an IC word (0.55) they are masked — a mistyped IC is still the
 *     patient's.
 */
function gradeMyKad(folded: string): ValidatorResult {
  const digits = folded.replace(/\D/g, "");
  const date = isMyKadDate(digits.slice(0, 6));
  const listed = MYKAD_PB_CODES.has(digits.slice(6, 8));
  const attrs = { date: date ? "valid" : "invalid", pbCode: listed ? "listed" : "unlisted" };
  if (!date) return { score: 0.2, attrs, note: "not a calendar date — masked only next to an IC word" };
  if (!listed) return { score: 0.6, attrs, note: "PB code not on JPN's list — masked anyway (fail closed)" };
  return { score: 0.85, attrs, note: "date of birth and JPN place-of-birth code" };
}

/**
 * MY_NRIC — the MyKad number (also MyKid, MyPR, MyKAS), YYMMDD-PB-###G:
 * date of birth, place-of-birth code, four more digits. Found with the two
 * hyphens, with spaces, or as one run of twelve digits, in any mix —
 * speech-to-text and hand typing produce all of them.
 */
export const nric = patternRecognizer({
  id: "my.nric",
  entity: "MY_NRIC",
  locales: MY,
  patterns: [{ name: "mykad", regex: `(?<![\\d+])\\d{6}${NRIC_SEP}\\d{2}${NRIC_SEP}\\d{4}(?!\\d)`, score: 0.5 }],
  validate: gradeMyKad,
  context: [
    "mykad", "mykid", "mypr", "mykas", "nric", "kad pengenalan", "identity card",
    "no. kp", "kp", "k/p", "ic no", "i/c", "ic",
  ],
  antiContext: NOT_PERSONAL,
  examples: {
    match: [
      "No. KP: ⟪850615-14-2468⟫",
      "IC ⟪850615142468⟫, MyKad ⟪850615 14 2468⟫",
      "⟪850615 - 14 - 2468⟫ dan ⟪850615–14–2468⟫", // spoken separators; en dashes
      "Pesakit lahir di luar negara, ⟪850615-71-2468⟫", // a country code
      "kad pengenalan ⟪850615-17-2468⟫", // PB 17 is unlisted: masked anyway
      "I/C ⟪991332-14-2468⟫", // no such date, but labelled as an IC
      "IC⟪850615142468⟫",
    ],
    noMatch: [
      "991332142468", // month 13
      "850230142468", // 30 February
      "Order no. 850615142468",
      "No. invois 850615-14-2468",
      "1850615142468", // 13 digits
      "85061514246", // 11 digits
      "850615-14-24680",
    ],
  },
});

const SEP = `[ .${DASH}]?`;
const digits = (count: string) => `(?:${SEP}\\d){${count}}`;
/**
 * After the trunk 0 or +60 — MCMC, Numbering and Electronic Addressing Plan
 * (NEAP, 2023), Part 9.2, Figures 9.1 and 9.2: public cellular numbers are
 * 01Y + a 7- or 8-digit subscriber number (Y = 0–4, 6–9; 011 is the
 * familiar 8-digit range), and other mobile providers 015 + 8 digits.
 */
const MOBILE = `1${SEP}(?:[0-46-9]${digits("7,8")}|5${digits("8")})`;
/**
 * NEAP Part 6, Figures 6.2 and 6.5–6.7: the one-digit area codes 3–7 and 9
 * take a 7- or 8-digit subscriber number (8 in 03 today), Sabah, Sarawak
 * and Labuan's 82–89 a 6-digit one; a subscriber number starts with 2–9.
 */
const LANDLINE = `(?:[3-79]${SEP}[2-9]${digits("6,7")}|8[2-9]${SEP}[2-9]${digits("5")})`;
const LANDLINE_IN_BRACKETS = `\\(0(?:[3-79]\\)${SEP}[2-9]${digits("6,7")}|8[2-9]\\)${SEP}[2-9]${digits("5")})`;

/**
 * PHONE_NUMBER (Malaysia) — mobiles and landlines per MCMC's Numbering and
 * Electronic Addressing Plan,
 * https://www.mcmc.gov.my/skmmgovmy/media/General/registers/Numbering-and-Electronic-Addressing-Plan.pdf
 * Written with the trunk 0, with +60 / 0060, or with a bare 60 (as in
 * wa.me links); a space, dot or dash may stand between any two digits, and
 * an area code may sit in brackets. Masked without context.
 */
export const phone = patternRecognizer({
  id: "my.phone",
  entity: "PHONE_NUMBER",
  locales: MY,
  patterns: [
    { name: "international", regex: `(?<![\\d+])(?:\\+|00)60${SEP}(?:${MOBILE}|${LANDLINE})(?!\\d)`, score: 0.7 },
    { name: "mobile", regex: `(?<![\\d+])(?:60|0)${SEP}${MOBILE}(?!\\d)`, score: 0.55 },
    { name: "landline", regex: `(?<![\\d+])(?:60|0)${SEP}${LANDLINE}(?!\\d)`, score: 0.5 },
    { name: "landline-brackets", regex: `(?<![\\d+])${LANDLINE_IN_BRACKETS}(?!\\d)`, score: 0.5 },
  ],
  context: [
    "tel", "telefon", "telefon bimbit", "bimbit", "phone", "mobile", "hp", "h/p", "handphone",
    "hubungi", "contact", "whatsapp", "call", "fax", "faks",
  ],
  antiContext: NOT_PERSONAL,
  attrs: { country: "MY" },
  examples: {
    match: [
      "Tel: ⟪012-345 6789⟫",
      "⟪011-2345 6789⟫", // 011: eight digits after the prefix
      "H/P ⟪+60 12-345 6789⟫ atau ⟪+6011 2345 6789⟫",
      "WhatsApp ⟪60123456789⟫",
      "⟪0060 19 876 5432⟫",
      "telefon bimbit ⟪0 1 2 3 4 5 6 7 8 9⟫", // speech-to-text, digit by digit
      "⟪015-4600 1234⟫",
      "Pejabat ⟪03-2345 6789⟫, ⟪+60 3-2345 6789⟫",
      "Klinik ⟪04-234 5678⟫",
      "Kuching ⟪082-234 567⟫",
      "Rumah ⟪(03) 2345 6789⟫, ⟪(088) 234 567⟫",
    ],
    noMatch: [
      "Invoice 0123456789",
      "012-345 678", // one digit short
      "015-234 5678", // 015 needs eight digits
      "03-1234 5678", // no subscriber number starts with 1
      "081-234 567", // 081 is not an area code
      "+65 9123 4567",
      "05-12-2024",
    ],
  },
});

/**
 * MY_PASSPORT — a letter and eight digits (A12345678). ⚠️ The Immigration
 * Department (imi.gov.my) does not publish the format; letter + 8 digits,
 * with A (Peninsular Malaysia and Labuan), H (Sabah) and K (Sarawak), is
 * documented by Microsoft Purview's "Malaysia passport number" definition,
 * https://learn.microsoft.com/en-us/purview/sit-defn-malaysia-passport-number,
 * and the Wikipedia article on the Malaysian passport. The shape is weak,
 * so a passport word is required — and with one, any letter is accepted:
 * a passport number next to "passport" is a passport number whatever its
 * prefix.
 */
export const passport = patternRecognizer({
  id: "my.passport",
  entity: "MY_PASSPORT",
  locales: MY,
  patterns: [{ name: "passport", regex: "(?<![a-z0-9])[a-z]\\d{8}(?![a-z0-9])", score: 0.3 }],
  context: ["passport", "pasport", "pp no"],
  examples: {
    match: ["Passport no. ⟪A12345678⟫", "No. pasport: ⟪H23456789⟫", "passport ⟪K34567890⟫"],
    noMatch: ["A12345678", "passport A1234567", "passport AB12345678", "passport A123456789"],
  },
});
