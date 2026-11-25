/**
 * Locale-independent recognizers: email, URL, IP address, payment card,
 * IBAN. Patterns are written against the FOLDED view (lower case, ASCII
 * digits); see docs/RECOGNIZERS.md for the scoring model.
 */
import { patternRecognizer, type Recognizer, type Span, type TextViews } from "@determask/core";
import { ASSET_EXTENSIONS, cardBrand, ibanChecksum, isIPv4, isIPv6, luhn } from "./validators.js";

const ANY = ["*"];

/**
 * EMAIL_ADDRESS — RFC 5321 §4.1.2 / RFC 5322 §3.4.1, simplified. The
 * local part is matched permissively (`jane..doe@` is invalid RFC syntax
 * but still identifies a person, so it is masked — fail closed); the domain
 * needs at least one dot and an alphabetic TLD, and a TLD that is really a
 * file extension (`icon@2x.png`) is refused.
 */
export const email = patternRecognizer({
  id: "core.email",
  entity: "EMAIL_ADDRESS",
  locales: ANY,
  patterns: [
    {
      name: "address",
      // starts only where a run of local-part characters starts: linear, not quadratic
      regex: "(?<![a-z0-9._%+'-])[a-z0-9._%+'-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}",
      score: 0.9,
    },
  ],
  validate: (folded) => {
    const labels = folded.slice(folded.indexOf("@") + 1).split(".");
    if (ASSET_EXTENSIONS.has(labels[labels.length - 1] as string)) return false;
    // two numeric labels is a version (`app@1.0.0.tgz`); one is a real domain (`163.com`)
    return labels.filter((l) => /^\d+$/.test(l)).length < 2;
  },
  examples: {
    match: [
      "Liên hệ ⟪nguyen.van.an@benhvien.vn⟫ hoặc ⟪an+bhyt@example.com⟫.",
      "Email: ⟪Đức.Trần@ví-dụ.vn⟫",
      "mailto:⟪jane.o'neil@acme.io⟫ or ⟪wang.li@163.com⟫",
      "typo still identifies: ⟪jane..doe@acme.io⟫ and ⟪jane.@acme.io⟫",
    ],
    noMatch: [
      // sam247/openredaction#165: technical strings in logs
      "lodash@4.17.21 installed",
      "npm i @types/node@1.2.3",
      "icon@2x.png",
      "price=5@3.50",
      "user@acme.123",
      "weird {x}@acme.io",
      "logo@3x.webp and app@1.0.0.tgz",
    ],
  },
});

/** URL — RFC 3986 §3, scheme-led or `www.`-led; trailing punctuation is not part of it. */
export const url = patternRecognizer({
  id: "core.url",
  entity: "URL",
  locales: ANY,
  patterns: [
    { name: "scheme", regex: "(?:https?|ftp)://[^\\s<>\"'`]*[^\\s<>\"'`.,;:!?)\\]}]", score: 0.6 },
    { name: "www", regex: "www\\.[^\\s<>\"'`]*[^\\s<>\"'`.,;:!?)\\]}]", score: 0.6 },
  ],
  examples: {
    match: [
      "Kết quả tại ⟪https://portal.benhvien.vn/kq?ma=24001234⟫.",
      "See ⟪www.example.com/patients/an⟫, then call.",
      "(⟪http://x.io/a⟫)",
    ],
    noMatch: ["https://", "the www. prefix", "file.txt and example.com without a scheme"],
  },
});

/** IPV4 — RFC 791: four octets 0–255. Version numbers are refused by context. */
export const ipv4 = patternRecognizer({
  id: "core.ipv4",
  entity: "IP_ADDRESS",
  locales: ANY,
  patterns: [{ name: "dotted", regex: "(?<![\\d.])\\d{1,3}(?:\\.\\d{1,3}){3}(?!\\.?\\d)", score: 0.6 }],
  validate: (folded) => isIPv4(folded),
  antiContext: ["version", "ver", "v", "build", "release", "section", "phiên bản", "verzija", "верзија"],
  examples: {
    match: ["login from ⟪203.0.113.42⟫ at 10:31", "IP: ⟪192.168.1.10⟫,"],
    noMatch: ["version 1.2.3.4", "1.2.3.4.5", "999.1.1.1", "v 10.0.0.1", "build 4.0.21.7"],
  },
});

/** IPV6 — RFC 4291 §2.2. Clock times (`12:30:45`) and `::` alone are refused. */
export const ipv6 = patternRecognizer({
  id: "core.ipv6",
  entity: "IP_ADDRESS",
  locales: ANY,
  patterns: [
    { name: "hex-groups", regex: "(?<![0-9a-f:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![0-9a-f:])", score: 0.6 },
  ],
  validate: (folded) => isIPv6(folded),
  examples: {
    match: ["client ⟪2001:db8::8a2e:370:7334⟫ connected", "bind ⟪::1⟫", "⟪FE80:0:0:0:0:0:0:1⟫"],
    noMatch: ["at 12:30:45 today", "a :: b", "cafe:babe:dead", "std::cout"],
  },
});

const CARD_CONTEXT = ["card", "credit card", "debit card", "thẻ", "số thẻ", "kartica", "картица", "visa", "mastercard"];

/**
 * CREDIT_CARD — 13–19 digits, contiguous or in the 4-4-4-4 / 4-6-5 / 4-6-4
 * groupings with one consistent separator. Luhn (ISO/IEC 7812-1) plus a
 * known issuer range masks anywhere; Luhn with an unknown issuer, or a
 * UnionPay number without Luhn (some are issued that way), needs context.
 */
export const creditCard = patternRecognizer({
  id: "core.credit-card",
  entity: "CREDIT_CARD",
  locales: ANY,
  patterns: [
    { name: "contiguous", regex: "(?<!\\d)\\d{13,19}(?!\\d)", score: 0.4 },
    { name: "4-4-4-4", regex: "(?<!\\d)\\d{4}([ -])\\d{4}\\1\\d{4}\\1\\d{4}(?:\\1\\d{1,3})?(?!\\d)", score: 0.4 },
    { name: "4-6-5", regex: "(?<!\\d)\\d{4}([ -])\\d{6}\\1\\d{4,5}(?!\\d)", score: 0.4 },
  ],
  validate: (folded) => {
    const digits = folded.replace(/\D/g, "");
    const brand = cardBrand(digits);
    if (luhn(digits)) {
      return brand !== undefined
        ? { score: 1, attrs: { brand }, note: "Luhn ok, known issuer" }
        : { note: "Luhn ok, unknown issuer — needs context" };
    }
    return brand === "unionpay" ? { note: "UnionPay without Luhn — needs context" } : false;
  },
  context: CARD_CONTEXT,
  examples: {
    match: [
      "Card ⟪4111 1111 1111 1111⟫ exp 12/29",
      "MC ⟪5555-5555-5555-4444⟫, Amex ⟪3782 822463 10005⟫",
      "⟪2223000048400011⟫",
      "số thẻ ⟪6200000000000005⟫",
      "card number ⟪1234567812345670⟫",
      "thẻ UnionPay ⟪6200000000000006⟫", // fails Luhn; some UnionPay cards are issued that way
    ],
    noMatch: [
      "4111 1111 1111 1112",
      "timestamp 1732521600000",
      "order 1234567812345670",
      "4111 1111-1111 1111",
      "6200000000000006", // UnionPay without Luhn and without context
    ],
  },
});

const ALNUM = /[a-z0-9]/u;
const GLUING_LETTER = /[\p{L}\p{M}_]/u;
const IBAN_START = /[a-z]{2}\d{2}/gu;

/**
 * IBAN_CODE — ISO 13616-1. A custom recognizer rather than one regex,
 * because a space-grouped IBAN is followed by words that look like more
 * groups ("BE68 5390 0754 7034 from"): a regex would swallow them, fail
 * the checksum, and leak the IBAN. So the text after a start is read as
 * groups (alphanumeric runs separated by single spaces), and candidates are
 * whole groups only — an IBAN ends where a run ends, never inside one.
 *
 * Candidates in the standard print form (one contiguous run, or groups of
 * four with a shorter last group) are tried first, longest first; only if
 * none passes MOD 97-10 are other groupings tried. Without that order, a
 * longer candidate that passes the checksum by chance (about 1 in 97)
 * would swallow the next words — in "…3000 and RS35…" it took "and RS"
 * and leaked the second IBAN.
 */
export const iban: Recognizer = {
  id: "core.iban",
  entities: ["IBAN_CODE"],
  locales: ANY,
  patterns: [{ name: "start", regex: IBAN_START.source }],
  examples: {
    match: [
      "IBAN ⟪DE89 3704 0044 0532 0130 00⟫ for the refund",
      "⟪GB29NWBK60161331926819⟫",
      "pay ⟪BE68 5390 0754 7034⟫ from Monday",
      "račun ⟪RS35 2600 0560 1001 6113 79⟫",
      "⟪DE89370400440532013000⟫ and ⟪RS35260005601001611379⟫",
    ],
    noMatch: ["DE89 3704 0044 0532 0130 01", "AB12 3456 7890 1234", "xDE89370400440532013000"],
  },
  analyze(views: TextViews): Span[] {
    const { text: f, starts, ends } = views.folded;
    const spans: Span[] = [];
    IBAN_START.lastIndex = 0;
    for (let m = IBAN_START.exec(f); m !== null; m = IBAN_START.exec(f)) {
      const s = m.index;
      if (s > 0 && GLUING_LETTER.test(f[s - 1] as string)) continue; // inside a word

      // Read groups: alphanumeric runs separated by single spaces, ≤ 34 characters in all.
      const groups: { text: string; end: number }[] = [];
      let group = "";
      let total = 0;
      let i = s;
      while (i < f.length && total < 34) {
        const c = f[i] as string;
        if (ALNUM.test(c)) {
          group += c;
          total++;
          i++;
        } else if (c === " " && i + 1 < f.length && ALNUM.test(f[i + 1] as string)) {
          groups.push({ text: group, end: i });
          group = "";
          i++;
        } else {
          break;
        }
      }
      groups.push({ text: group, end: i });

      const candidates = groups.map((g, k) => ({
        compact: groups.slice(0, k + 1).map((x) => x.text).join(""),
        end: g.end,
        standard: k === 0 || groups.slice(0, k).every((x) => x.text.length === 4),
        endsRun: g.end === f.length || !ALNUM.test(f[g.end] as string),
      }));
      const pass = (c: (typeof candidates)[number]) => c.endsRun && ibanChecksum(c.compact);
      const longestFirst = candidates.reverse();
      const hit = longestFirst.find((c) => c.standard && pass(c)) ?? longestFirst.find(pass);
      if (hit === undefined) continue;
      spans.push({
        entity: "IBAN_CODE",
        start: starts[s] as number,
        end: ends[hit.end - 1] as number,
        score: 1,
        recognizer: "core.iban",
        trace: [{ rule: "pattern:start" }, { rule: "validator", detail: "ISO 7064 MOD 97-10", scoreAfter: 1 }],
      });
      IBAN_START.lastIndex = hit.end;
    }
    return spans;
  },
};
