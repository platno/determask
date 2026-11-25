/**
 * Validators for Singapore identifiers. Each takes the FOLDED match (lower
 * case, ASCII digits) and cites its source.
 */

const NRIC_WEIGHTS = [2, 7, 6, 5, 4, 3, 2];
const TABLE_ST = "jzihgfedcba";
const TABLE_FG = "xwutrqpnmlk";
/**
 * M-series FINs (issued from 2022). ⚠️ COMMUNITY-DERIVED: ICA has never
 * published the NRIC/FIN algorithm. This table (offset 3, letters
 * XWUTRQPNJLK) is the one sg-pii-rules (Apache-2.0) documents and samliew
 * and FormSG implement; presidio-sg-recognizers disagrees at remainder 8
 * (M instead of J). Which is right does not change what is MASKED — see
 * `nricCheck` — only whether a finding says "valid" or "unverified".
 */
const TABLE_M = "xwutrqpnjlk";

/**
 * The expected check letter of an NRIC/FIN (S/T citizens and PRs, F/G
 * foreigners before 2022, M foreigners from 2022): weights 2,7,6,5,4,3,2
 * over the seven digits, +4 for T and G, +3 for M, remainder mod 11 indexes
 * the prefix's table. Undefined for any other shape.
 */
export function nricCheckLetter(nric: string): string | undefined {
  const m = /^([stfgm])(\d{7})[a-z]$/.exec(nric);
  if (m === null) return undefined;
  const prefix = m[1] as string;
  const digits = m[2] as string;
  let sum = prefix === "t" || prefix === "g" ? 4 : prefix === "m" ? 3 : 0;
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * (NRIC_WEIGHTS[i] as number);
  const table = prefix === "s" || prefix === "t" ? TABLE_ST : prefix === "f" || prefix === "g" ? TABLE_FG : TABLE_M;
  return table[sum % 11];
}

/**
 * Postal code — six digits, the first two the postal sector (01–82),
 * per SingPost's addressing scheme. Every Singapore postal code names a
 * single building, which is why the code alone is a strong identifier.
 */
export function isPostalCode(digits: string): boolean {
  if (!/^\d{6}$/.test(digits)) return false;
  const sector = Number(digits.slice(0, 2));
  return sector >= 1 && sector <= 82;
}
