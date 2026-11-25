/**
 * Validators for the locale-independent identifiers. Each is written from
 * the primary specification named in its comment, and takes the FOLDED
 * match (lower case, ASCII digits).
 */

/**
 * Luhn mod-10 check — ISO/IEC 7812-1:2017, Annex B. From the rightmost
 * digit, double every second digit, subtract 9 from any result above 9,
 * and the total must be a multiple of 10.
 */
export function luhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Card issuer from the IIN (first digits) and length, per the ranges the
 * networks publish: Visa 4; Mastercard 51–55 and 2221–2720 (2017); American
 * Express 34, 37; Discover 6011, 644–649, 65; JCB 3528–3589; Diners Club
 * 300–305, 36, 38, 39; UnionPay 62. Undefined when no range matches.
 */
export function cardBrand(digits: string): string | undefined {
  const n = digits.length;
  const p2 = Number(digits.slice(0, 2));
  const p3 = Number(digits.slice(0, 3));
  const p4 = Number(digits.slice(0, 4));
  if (digits[0] === "4" && (n === 13 || n === 16 || n === 19)) return "visa";
  if (((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) && n === 16) return "mastercard";
  if ((p2 === 34 || p2 === 37) && n === 15) return "amex";
  if ((p4 === 6011 || (p3 >= 644 && p3 <= 649) || p2 === 65) && n >= 16 && n <= 19) return "discover";
  if (p4 >= 3528 && p4 <= 3589 && n >= 16 && n <= 19) return "jcb";
  if (((p3 >= 300 && p3 <= 305) || p2 === 36 || p2 === 38 || p2 === 39) && n >= 14 && n <= 19) return "diners";
  if (p2 === 62 && n >= 16 && n <= 19) return "unionpay";
  return undefined;
}

/**
 * IBAN check digits — ISO 13616-1:2020 §6, computed with ISO/IEC 7064
 * MOD 97-10: move the first four characters to the end, replace each letter
 * with two digits (A=10 … Z=35), and the number mod 97 must be 1.
 * Only the structure is checked (2 letters, 2 digits, 11–30 alphanumerics);
 * the per-country length table is deliberately not applied, so an IBAN from
 * a country added to the registry later is still masked.
 */
export function ibanChecksum(compact: string): boolean {
  const s = compact.toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    remainder = value > 9 ? (remainder * 100 + value) % 97 : (remainder * 10 + value) % 97;
  }
  return remainder === 1;
}

/** IPv4 dotted decimal — RFC 791 §3.2 / RFC 1123 §2.1: four octets, each 0–255. */
export function isIPv4(s: string): boolean {
  const parts = s.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/**
 * IPv6 text form — RFC 4291 §2.2: eight groups of 1–4 hex digits, or fewer
 * with exactly one "::". "::" alone is refused (it is punctuation in code
 * far more often than an address). Embedded IPv4 tails are not handled
 * here; the IPv4 recognizer covers them and the union masks both.
 */
export function isIPv6(s: string): boolean {
  if (s.includes(":::")) return false;
  const halves = s.split("::");
  if (halves.length > 2) return false;
  const groups = (part: string): string[] => (part === "" ? [] : part.split(":"));
  const all = halves.flatMap(groups);
  if (all.length === 0 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return false;
  return halves.length === 2 ? all.length <= 7 : all.length === 8;
}

/**
 * File extensions that look like top-level domains in technical text:
 * `icon@2x.png`, `logo@3x.webp`. None is a delegated TLD in the IANA root
 * zone (checked against IANA's list, version 2026112402), so refusing them
 * loses no real address. ⛔ `map`, `md`, `zip` and `mov` ARE delegated TLDs
 * and must never be added here.
 */
export const ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tif", "tiff", "avif",
  "css", "scss", "js", "mjs", "cjs", "jsx", "ts", "tsx", "json", "txt",
  "html", "htm", "xml", "yml", "yaml", "lock", "wasm", "woff", "woff2", "ttf",
]);
