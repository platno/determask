/**
 * Validators for Serbian identifiers. Each takes digits only and cites its
 * source.
 */

const daysIn = (month: number, year: number): number =>
  month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;

/**
 * JMBG (jedinstveni matični broj građana) — Zakon o jedinstvenom matičnom
 * broju građana: DD MM YYY RR BBB K. DD.MM is the date of birth and YYY
 * the last three digits of the year (≥ 800 → 1800s–1900s, otherwise
 * 2000s); RR the registration region; BBB the serial (000–499 male,
 * 500–999 female); K the check digit
 *   m = 11 − ((7(a₁+a₇) + 6(a₂+a₈) + 5(a₃+a₉) + 4(a₄+a₁₀) + 3(a₅+a₁₁) + 2(a₆+a₁₂)) mod 11),
 *   K = m when m is 1–9, else 0.
 * Reproduces the standard published example 0101006500006. The date must
 * exist (29 February only in a leap year); it is not compared with today,
 * so the same text masks the same way every year (D1).
 */
export function isJmbg(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  const a = [...digits].map(Number);
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const yyy = Number(digits.slice(4, 7));
  const year = yyy >= 800 ? 1000 + yyy : 2000 + yyy;
  if (month < 1 || month > 12 || day < 1 || day > daysIn(month, year)) return false;
  const s =
    7 * ((a[0] as number) + (a[6] as number)) +
    6 * ((a[1] as number) + (a[7] as number)) +
    5 * ((a[2] as number) + (a[8] as number)) +
    4 * ((a[3] as number) + (a[9] as number)) +
    3 * ((a[4] as number) + (a[10] as number)) +
    2 * ((a[5] as number) + (a[11] as number));
  const m = 11 - (s % 11);
  return (m > 9 ? 0 : m) === a[12];
}

/**
 * PIB (poreski identifikacioni broj) — 9 digits, the last a check digit by
 * ISO/IEC 7064 MOD 11,10 (Pravilnik o PIB-u, Poreska uprava). Validates the
 * published PIB of NIS a.d. (104052135), a business identifier.
 */
export function isPib(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  let p = 10;
  for (let i = 0; i < 8; i++) {
    let s = (Number(digits[i]) + p) % 10;
    if (s === 0) s = 10;
    p = (2 * s) % 11;
  }
  return (11 - p) % 10 === Number(digits[8]);
}

/**
 * Bank account number — 3-digit bank code, 13-digit account (written with
 * leading zeros dropped in the dashed form), 2 control digits by ISO/IEC
 * 7064 MOD 97-10: control = 98 − (first 16 digits × 100 mod 97) (Narodna
 * banka Srbije's uniform technical rules for payment orders). The SWIFT
 * IBAN Registry's Serbian example RS35 2600 0560 1001 6113 79 embeds the
 * account 260-0056010016113-79, which satisfies it.
 * Takes the dashed form (`160-123456-54`) or 18 contiguous digits.
 */
export function isRsAccount(value: string): boolean {
  let digits: string;
  const dashed = /^(\d{3})-(\d{1,13})-(\d{2})$/.exec(value);
  if (dashed !== null) {
    digits = (dashed[1] as string) + (dashed[2] as string).padStart(13, "0") + (dashed[3] as string);
  } else if (/^\d{18}$/.test(value)) {
    digits = value;
  } else {
    return false;
  }
  let remainder = 0;
  for (const ch of digits.slice(0, 16)) remainder = (remainder * 10 + Number(ch)) % 97;
  return 98 - ((remainder * 100) % 97) === Number(digits.slice(16));
}
