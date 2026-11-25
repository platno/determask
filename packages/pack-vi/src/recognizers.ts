/**
 * Vietnamese recognizers. Patterns are written against the FOLDED view
 * (lower case, accents stripped, đ→d, ASCII digits); see
 * docs/RECOGNIZERS.md for the scoring model. All test values are synthetic.
 */
import { patternRecognizer } from "@determask/core";
import { isCccd, isMst } from "./validators.js";

const VI = ["vi-VN"];

/**
 * Words that mean the number next to them is an order, invoice or lot — not
 * a person's. ⛔ Keep these SPECIFIC: an anti-context word rejects the
 * candidate, so a common word here is a leak. "lô" alone folds to "lo"
 * (also "worry") and would reject "lo lắng, CCCD 001…"; only "số lô" is used.
 */
const NOT_PERSONAL = [
  "hóa đơn", "số hóa đơn", "mã đơn", "mã đơn hàng", "đơn hàng", "mã vận đơn", "vận đơn",
  "số lô", "invoice", "order", "order id", "tracking",
];

/**
 * VN_PERSONAL_ID — the 12-digit personal identification number (CCCD, căn
 * cước, số định danh cá nhân). Since 1 July 2025 the same number also
 * serves as the personal tax code, and since 1 August 2025 as the social
 * and health insurance number, so those labels are context words here.
 * Structure-checked (province code + century digit), masked without
 * context; an order or invoice word before it rejects it.
 */
export const personalId = patternRecognizer({
  id: "vi.personal-id",
  entity: "VN_PERSONAL_ID",
  locales: VI,
  patterns: [
    { name: "contiguous", regex: "(?<!\\d)0\\d{11}(?!\\d)", score: 0.6 },
    { name: "grouped", regex: "(?<!\\d)0\\d{2}([ .])\\d{3}\\1\\d{3}\\1\\d{3}(?!\\d)", score: 0.6 },
  ],
  validate: (folded) => isCccd(folded.replace(/\D/g, "")),
  context: [
    "cccd", "căn cước", "căn cước công dân", "số định danh", "định danh cá nhân", "cmnd/cccd",
    "mã số thuế", "mst", "bhxh", "mã số bhxh", "bhyt",
  ],
  antiContext: NOT_PERSONAL,
  examples: {
    match: [
      "CCCD: ⟪001099012345⟫, cấp ngày 01/01/2021",
      "Số định danh ⟪079 203 012 345⟫",
      "BN Lê Thị Bình, ⟪036186001234⟫, nhập viện",
      "căn cước ⟪０３６１８６００１２３４⟫",
    ],
    noMatch: [
      "Mã đơn hàng 001099012345", // S-001: a 12-digit order id starting with 0
      "Order ID 079203012345",
      "003099012345", // 003 is not a province code
      "001499012345", // century digit 4: no one born after 2099 has one yet
      "1001099012345", // 13 digits
    ],
  },
});

/** VN_LEGACY_ID_CARD — the 9-digit identity card (CMND), still in old records. Context required. */
export const legacyIdCard = patternRecognizer({
  id: "vi.legacy-id-card",
  entity: "VN_LEGACY_ID_CARD",
  locales: VI,
  patterns: [{ name: "nine-digits", regex: "(?<!\\d)\\d{9}(?!\\d)", score: 0.2 }],
  context: ["cmnd", "cmt", "chứng minh", "chứng minh nhân dân", "số cmnd"],
  contextBoost: 0.4,
  antiContext: NOT_PERSONAL,
  examples: {
    match: ["CMND số ⟪012345678⟫", "Chứng minh nhân dân: ⟪125123456⟫"],
    noMatch: ["012345678", "số lô 012345678 CMND"],
  },
});

/** VN_TAX_CODE — the 10-digit enterprise tax code (MST), optionally `-` + 3-digit branch. Mod-11 check; context required. */
export const taxCode = patternRecognizer({
  id: "vi.tax-code",
  entity: "VN_TAX_CODE",
  locales: VI,
  patterns: [{ name: "mst", regex: "(?<!\\d)\\d{10}(?:-\\d{3})?(?!\\d)", score: 0.3 }],
  validate: (folded) => isMst(folded),
  context: ["mst", "mã số thuế", "mã số doanh nghiệp", "tax code", "tax id"],
  examples: {
    match: ["MST: ⟪0100000003⟫", "Mã số thuế ⟪0301234562-001⟫", "MST ⟪0791234569⟫"],
    noMatch: ["0100000003", "MST: 0100000004", "ts 1732521600 mst"],
  },
});

/**
 * VN_HEALTH_INSURANCE_CARD — the 15-character health insurance card code
 * (thẻ BHYT, pre-2025 format): 2 letters (beneficiary group), 1 digit
 * (benefit level 1–5), 2 digits (province), 10 digits (BHXH number). Shape
 * per QĐ 1351/QĐ-BHXH as summarised in the founding research; the group
 * code table itself is a ROADMAP open item, so any two letters are accepted.
 */
export const healthInsuranceCard = patternRecognizer({
  id: "vi.health-insurance-card",
  entity: "VN_HEALTH_INSURANCE_CARD",
  locales: VI,
  patterns: [
    {
      name: "bhyt",
      regex: "(?<![a-z0-9])[a-z]{2}[ .-]?[1-5][ .-]?\\d{2}[ .-]?\\d{10}(?!\\d)",
      score: 0.6,
    },
  ],
  context: ["bhyt", "bảo hiểm y tế", "thẻ bhyt", "mã thẻ", "số thẻ"],
  examples: {
    match: ["Thẻ BHYT: ⟪DN4010123456789⟫", "mã thẻ ⟪GD 4 79 1234567890⟫", "⟪HS4011234567890⟫ còn hạn"],
    noMatch: ["DN6010123456789", "DN401012345678", "xDN4010123456789"],
  },
});

/** VN_SOCIAL_INSURANCE_NUMBER — the 10-digit social insurance number (mã số BHXH). Context required. */
export const socialInsuranceNumber = patternRecognizer({
  id: "vi.social-insurance-number",
  entity: "VN_SOCIAL_INSURANCE_NUMBER",
  locales: VI,
  patterns: [{ name: "ten-digits", regex: "(?<!\\d)\\d{10}(?!\\d)", score: 0.2 }],
  context: ["bhxh", "mã số bhxh", "số sổ bhxh", "bảo hiểm xã hội"],
  contextBoost: 0.4,
  examples: {
    match: ["Mã số BHXH: ⟪7912345678⟫"],
    noMatch: ["7912345678", "ts 1732521600"],
  },
});

const PHONE_CONTEXT = [
  "sđt", "số điện thoại", "điện thoại", "đt", "đtdđ", "di động", "zalo", "hotline",
  "liên hệ", "gọi", "phone", "tel", "mobile",
];
/**
 * A tax code is 10 digits too, and 03x/07x/08x look like mobile prefixes
 * (F7). "tài khoản" alone is NOT here: "tài khoản Zalo 0912…" is a phone.
 */
const NOT_A_PHONE = [...NOT_PERSONAL, "mst", "mã số thuế", "tax code", "stk", "số tài khoản"];

/**
 * PHONE_NUMBER (Vietnam) — the numbering plan after the 2018 conversion
 * (Ministry of Information and Communications Circular 22/2014 and its 2018
 * amendments): mobiles 0 + 3[2-9] | 5[25689] | 7[06-9] | 8[1-9] | 9x + 7
 * digits; landlines 0 + 2x + 8 digits; +84 / 0084 instead of the leading 0.
 * Pre-2018 11-digit mobiles (01[2689]…) still appear in old records and
 * need context. Separators: one space, dot or dash between digits.
 */
export const phone = patternRecognizer({
  id: "vi.phone",
  entity: "PHONE_NUMBER",
  locales: VI,
  patterns: [
    {
      name: "mobile",
      regex: "(?<![\\d+])(?:\\+84|0084|0)[ .-]?(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9\\d)(?:[ .-]?\\d){7}(?!\\d)",
      score: 0.55,
    },
    { name: "landline", regex: "(?<![\\d+])(?:\\+84|0084|0)[ .-]?2\\d(?:[ .-]?\\d){8}(?!\\d)", score: 0.5 },
    { name: "legacy-mobile", regex: "(?<![\\d+])(?:\\+84|0)1[2689](?:[ .-]?\\d){8}(?!\\d)", score: 0.3 },
  ],
  context: PHONE_CONTEXT,
  antiContext: NOT_A_PHONE,
  attrs: { country: "VN" },
  examples: {
    match: [
      "SĐT: ⟪0912 345 678⟫",
      "Zalo ⟪+84 912.345.678⟫",
      "BN ⟪0383456789⟫",
      "Điện thoại bàn ⟪024 3825 1234⟫",
      "SĐT cũ ⟪01223456789⟫",
    ],
    noMatch: [
      "Invoice 0312345678", // the founding research's numbers-only probe
      "MST 0791234569",
      "01223456789", // a legacy mobile needs context
      "0112345678", // 011 is not a prefix
      "STK 0912345678",
    ],
  },
});
