# @determask/pack-core

Locale-independent recognizers. They serve every locale (`"*"`), so load
this pack next to whichever locale packs you use.

```ts
import { createEngine } from "@determask/core";
import { corePack } from "@determask/pack-core";

const engine = createEngine({ configVersion: 1 }, { packs: [corePack] });
```

## What it detects

| Entity | Recognizer | How | Masked without context? |
|---|---|---|---|
| `EMAIL_ADDRESS` | `core.email` | local part (plain, or quoted as in `"john smith"@…`), `@`, dotted domain with an alphabetic TLD | yes (0.9) |
| `URL` | `core.url` | `http(s)://`, `ftp://` or `www.`; trailing punctuation excluded | yes (0.6) |
| `IP_ADDRESS` | `core.ipv4`, `core.ipv6` | IPv4 octets 0–255; IPv6 full or `::`-compressed | yes (0.6) |
| `CREDIT_CARD` | `core.credit-card` | 13–19 digits, contiguous or 4-4-4-4 / 4-6-5 / 4-6-4 with one consistent separator; Luhn + issuer range | yes with a known issuer (1.0); otherwise only with context |
| `IBAN_CODE` | `core.iban` | 2 letters, 2 check digits, up to 30 alphanumerics, spaced or not; MOD 97-10 | yes (1.0) |

A validated card carries `attrs.brand` (`visa`, `mastercard`, `amex`,
`discover`, `jcb`, `diners`, `unionpay`).

## Sources behind the validators

- **Luhn**: ISO/IEC 7812-1:2017, Annex B.
- **Card issuer ranges**: the ranges the networks publish, including
  Mastercard's 2221–2720 series (2017).
- **IBAN**: ISO 13616-1:2020 §6, check digits by ISO/IEC 7064 MOD 97-10.
  Test vectors are the SWIFT IBAN Registry's examples.
- **IPv4**: RFC 791 §3.2. **IPv6**: RFC 4291 §2.2.
- **Email**: RFC 5321 §4.1.2 and RFC 5322 §3.4.1, simplified (below).
- **URL**: RFC 3986 §3.

## Behaviour worth knowing

- **Technical strings are not emails.** `lodash@4.17.21`, `@types/node@1.2.3`,
  `icon@2x.png`, `price=5@3.50` and `user@acme.123` are not masked — the
  false positives reported against another redactor in
  [openredaction#165](https://github.com/sam247/openredaction/issues/165)
  are no-match examples here. A TLD that is really a file extension is
  refused; the list was checked against IANA's root zone, and `.map`,
  `.md`, `.zip` and `.mov` are real TLDs, so they are never refused.
  Two numeric labels (`app@1.0.0.tgz`) is a version; one (`wang.li@163.com`)
  is a real domain.
- **Malformed but identifying addresses ARE masked.** `jane..doe@acme.io`
  and `jane.@acme.io` break RFC syntax but still name a person; masking them
  is the fail-closed choice.
- **Version numbers are not IPs.** `version 1.2.3.4`, `v 10.0.0.1`,
  `build 4.0.21.7` and five-part strings are refused; so are clock times
  (`12:30:45`) and `::` on its own.
- **An IBAN is never swallowed into the next word.** The text after an IBAN
  start is read as groups, and an IBAN ends where a group ends — never in the
  middle of a run. In `BE68 5390 0754 7034 from Monday` the IBAN ends before
  `from`. The standard print form (one contiguous run, or groups of four) is
  tried before any other grouping, because a longer candidate can pass
  MOD 97-10 by chance (about 1 in 97) — before this rule,
  `DE89370400440532013000 and RS35…` was masked as one span that took
  `and RS` and leaked the second IBAN's digits.
- **Labels glued to numbers, and other scripts' digits.** `card4111111111111111`,
  `IP203.0.113.42` and a card written in Arabic-Indic or Devanagari digits are
  all found (the core fold and boundary rules).
- **A card number without Luhn is masked only with context** — except that a
  UnionPay number (62…) is accepted with context even when Luhn fails, as
  some are issued that way. Without context, a Luhn-valid number from an
  unknown issuer scores 0.4 and is not masked: order numbers and timestamps
  stay readable.
- **A URL carrying an email is one region**, labelled by the stronger finding.

## Not covered yet

- MAC addresses, phone numbers in international E.164 form without a locale
  (each locale pack covers its own country's phones), and IPv6 with an
  embedded IPv4 tail as one span (the two recognizers' spans are joined by
  the union, so nothing leaks).
- The NAPAS domestic card range (9704) — whether its cards satisfy Luhn is
  unverified; it belongs in `@determask/pack-vi` once settled.
