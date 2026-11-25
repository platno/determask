/**
 * Validators for Vietnamese identifiers. Each takes the FOLDED match
 * (ASCII digits, lower case) and cites its source.
 */

/**
 * The 63 province codes that open a 12-digit personal identification number
 * (CCCD / số định danh cá nhân) — Circular 07/2016/TT-BCA, Appendix I, as
 * tabled in the founding research and cross-checked against
 * ntrieuvi97/vipii (MIT) and baoquocte.vn. The codes record the province of
 * birth registration under the pre-2025 map and stay valid indefinitely:
 * the 2025 merger to 34 provinces did not renumber issued identifiers.
 */
export const CCCD_PROVINCE_CODES: ReadonlySet<string> = new Set(
  (
    "001 002 004 006 008 010 011 012 014 015 017 019 020 022 024 025 026 027 030 031 033 " +
    "034 035 036 037 038 040 042 044 045 046 048 049 051 052 054 056 058 060 062 064 066 " +
    "067 068 070 072 074 075 077 079 080 082 083 084 086 087 089 091 092 093 094 095 096"
  ).split(" "),
);

/**
 * CCCD structure — Decree 137/2015/ND-CP Art. 13 and Circular 59/2021/TT-BCA
 * Art. 7: 3 digits province code, 1 digit century-and-gender (0/1 born
 * 1900–1999, 2/3 born 2000–2099), 2 digits year of birth, 6 digits serial.
 * There is no check digit, so this is a structural check, not a checksum.
 * The year is deliberately not compared with today's date: that would make
 * the output depend on when it runs (D1).
 */
export function isCccd(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;
  return CCCD_PROVINCE_CODES.has(digits.slice(0, 3)) && "0123".includes(digits[3] as string);
}

const MST_WEIGHTS = [31, 29, 23, 19, 17, 13, 7, 5, 3];

/**
 * Enterprise tax code (mã số thuế, MST) check digit: the 10th digit equals
 * 10 − (Σ dᵢ·wᵢ mod 11) over the first nine digits with weights
 * 31, 29, 23, 19, 17, 13, 7, 5, 3; a remainder of 0 has no valid check
 * digit. Weights as given in the founding research; confirmed on published
 * enterprise codes (0100109106, 0100686209, 0300588569). Verifying them
 * against the General Department of Taxation's own specification is a
 * ROADMAP open item. A 13-digit branch code (`0100109106-001`) is checked
 * on its first ten digits.
 */
export function isMst(code: string): boolean {
  const digits = code.replace("-", "");
  if (!/^\d{10}(?:\d{3})?$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (MST_WEIGHTS[i] as number);
  const remainder = sum % 11;
  return remainder !== 0 && 10 - remainder === Number(digits[9]);
}
