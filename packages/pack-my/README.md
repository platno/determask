# @determask/pack-my

Malaysian locale pack (`ms-MY`, `en-MY`): the MyKad number, phone numbers
and passports. Load it with [`@determask/pack-core`](../pack-core) for
email, URL, IP, card and IBAN.

```ts
import { createEngine } from "@determask/core";
import { myPack } from "@determask/pack-my";

const engine = createEngine({ configVersion: 1, locales: { primary: "ms-MY" } }, { packs: [myPack] });
```

## What it detects

| Entity | Recognizer | How | Masked without context? |
|---|---|---|---|
| `MY_NRIC` | `my.nric` | 12-digit MyKad number `YYMMDD-PB-###G`, with hyphens, spaces or neither; a real date of birth and JPN's place-of-birth (PB) codes | yes — 0.85 with a listed PB code, 0.6 with an unlisted one; twelve digits that open with no real date need an IC word (0.55) |
| `PHONE_NUMBER` | `my.phone` | mobiles `01Y` + 7 or 8 digits (`011-2345 6789`), `015` + 8; landlines `03`–`07`, `09` + 7 or 8 digits, `082`–`089` + 6; with `0`, `+60`, `0060` or a bare `60`; area code optionally in brackets | yes — 0.7 with `+60` / `0060`, 0.55 for a mobile, 0.5 for a landline |
| `MY_PASSPORT` | `my.passport` | a letter + 8 digits (`A12345678`) | no — needs "passport", "pasport", … |

MyKad findings carry `attrs.date` (`"valid"` or `"invalid"`) and
`attrs.pbCode` (`"listed"` or `"unlisted"`); phones carry
`attrs.country = "MY"`.

## Sources behind the validators

- **MyKad PB codes**: the National Registration Department's (JPN) own
  tables, retrieved 2026-11-26 —
  [Kod Negeri](https://www.jpn.gov.my/my/kod-negeri) for states and
  federal territories (01–16, 21–59, and 82 for "state unknown") and
  [Kod Negara](https://www.jpn.gov.my/my/kod-negara) for births abroad
  (60–68, 71, 72, 74–79, 83–93, 98, 99). That is 86 codes; 00, 17–20, 69,
  70, 73, 80, 81 and 94–97 are not listed.
- **MyKad structure**: ⚠️ JPN publishes the PB codes but not the structure
  of the number. `YYMMDD-PB-###G` — date of birth, PB code, four digits, no
  check digit — is documented by Microsoft Purview's
  [Malaysia identity card number](https://learn.microsoft.com/en-us/purview/sit-defn-malaysia-identification-card-number)
  definition and the Wikipedia article. The last digit is widely said to
  encode sex; this pack does not rely on that, and does not report it.
- **Phones**: MCMC, [Numbering and Electronic Addressing Plan](https://www.mcmc.gov.my/skmmgovmy/media/General/registers/Numbering-and-Electronic-Addressing-Plan.pdf)
  (2023). Part 6 for landlines: the area codes (Figure 6.2) and 8-, 7- and
  6-digit subscriber numbers that start with 2–9 (Figures 6.5–6.7).
  Part 9.2 for mobiles: `01Y` with Y = 0–4 or 6–9 and a 7- or 8-digit
  subscriber number (Figure 9.1), and `015` + 8 digits for other mobile
  providers (Figure 9.2).
- **Passports**: ⚠️ the Immigration Department (imi.gov.my) does not
  publish the format. A letter and eight digits — A for Peninsular Malaysia
  and Labuan, H for Sabah, K for Sarawak — is documented by Microsoft
  Purview's [Malaysia passport number](https://learn.microsoft.com/en-us/purview/sit-defn-malaysia-passport-number)
  definition and the Wikipedia article.

## Behaviour worth knowing

- **An unlisted PB code is masked anyway.** The full list was confirmed on
  JPN's own pages, but it is an administrative table that has grown —
  Putrajaya (16) became a federal territory in 2001, after 12-digit numbers
  were already being issued — and a mistyped or misheard PB code is still
  someone's IC. So a listed code scores 0.85 and says `pbCode: "listed"`;
  any other code is still masked at 0.6 and says `pbCode: "unlisted"`,
  the way pack-sg treats an NRIC whose check letter does not match. A
  deployment that wants only listed codes without context can set
  `thresholds: { perEntity: { MY_NRIC: 0.7 } }`; an IC word still lifts an
  unlisted code to 0.95.
- **The date is the gate.** Twelve digits that do not open with a real
  date — month 13, 30 February, 29 February in a year that is not a
  multiple of 4 — are not masked on their own: the date is what tells a
  MyKad from the other 12-digit numbers in a record. Next to an IC word
  they are (0.55, `date: "invalid"`), because a mistyped IC is still the
  patient's. Both centuries count (`000229` is 29 February 2000), and the
  date is not compared with today's (D1).
- **Any separators.** Speech-to-text and hand typing write the same IC as
  `850615-14-2468`, `850615 14 2468`, `850615142468`, `850615 - 14 - 2468`
  or with en dashes; all are found, as are mixtures. Phones take a space,
  dot or dash between any two digits, including digit-by-digit dictation
  (`0 1 2 3 4 5 6 7 8 9`). The folded view does not turn Unicode dashes
  (U+2010–U+2015, U+2212) into `-`, so these patterns list them.
- **Order and invoice numbers are not ICs.** "Order no.", "order number",
  "order id", "no. pesanan", "invoice", "invois", "receipt no.", "no. resit",
  "tracking no." and "tracking number" *before* a number reject it as an IC
  and as a phone. The list is kept narrow, because an anti-context word
  rejects the value even when an IC word sits closer to it. Deliberately
  not on it: "order" alone ("doctor's order"), "pesanan" alone (also
  "message"), "order no" without the period ("order no further tests"),
  "tracking" alone, and "akaun" / "account" — a bank account number is
  personal data too, so masking it as an IC or a phone is the safe
  direction.
- **Twelve digits can be an IC and a phone at once.** `601123456789` is
  both `+60 11-2345 6789` without the plus and an IC for 23 November 1960,
  PB 45. It is masked either way; a phone word nearby labels it
  `PHONE_NUMBER`, otherwise it is `MY_NRIC`. With the `+` it is only a
  phone.
- **Labels typed against the number are fine.** `IC850615142468`,
  `No.KP850615-14-2468` and `HP0123456789` are found as if they were spaced.
- **No birthplace or sex attribute.** The PB code tells the state or
  country of birth; findings deliberately do not carry it.
- All examples and test values are synthetic: constructed from the
  structure, not taken from a person.

## Not covered yet

- **Names and addresses**: Malay `bin` / `binti` and Indian `a/l` / `a/p`
  connectors as name anchors, Chinese surname-first forms, and address
  anchors (Jalan, Lorong, Taman, Kampung, Lot) — use `knownValues` until
  then.
- **Postcodes**: five digits are too generic to mask without an address
  anchor; they wait for the address recognizer.
- Identity card numbers from before the 12-digit format, army and police
  numbers, birth certificate numbers, vehicle plates, the income tax number
  (TIN), EPF / KWSP, SOCSO / PERKESO and bank account numbers, and dates of
  birth.
- **Passport numbers without their letter**: secondary sources report an
  8-digit form on newer passports; unverified, so not matched.
- **Toll-free and premium numbers** (`1-300`, `1-800`): business numbers,
  not personal ones.
- **The planned move to 8-digit subscriber numbers everywhere** (NEAP
  6.4.3): `08x` landlines are found in today's 6-digit form only.
- **libphonenumber-js**: as in the other packs, this first version uses the
  numbering plan directly, with no dependency.
