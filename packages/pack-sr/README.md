# @determask/pack-sr

Serbian locale pack (`sr-RS`, `sr-Latn-RS`, `sr-Cyrl-RS`): the personal
identification number, tax and bank account numbers, the health insurance
number, and phone numbers — in Latin and Cyrillic. Load it with
[`@determask/pack-core`](../pack-core) for email, URL, IP, card and IBAN.

```ts
import { createEngine } from "@determask/core";
import { srPack } from "@determask/pack-sr";

const engine = createEngine({ configVersion: 1, locales: { primary: "sr-RS" } }, { packs: [srPack] });
```

## What it detects

| Entity | Recognizer | How | Masked without context? |
|---|---|---|---|
| `RS_PERSONAL_ID` | `sr.jmbg` | 13-digit JMBG: a date of birth that exists, plus the check digit | yes (0.9) |
| `RS_TAX_CODE` | `sr.pib` | 9-digit PIB, ISO 7064 MOD 11,10 check digit | no — needs "PIB" / "ПИБ", … |
| `RS_BANK_ACCOUNT` | `sr.bank-account` | `BBB-AAAAAAAAAAAAA-CC` (account digits may drop leading zeros) or 18 digits; MOD 97-10 control | dashed form yes (0.9); 18 bare digits need "račun" / "рачун", … |
| `RS_HEALTH_INSURANCE_NUMBER` | `sr.lbo` | 11-digit LBO | no — needs "LBO" / "ЛБО", "broj osiguranika", … |
| `PHONE_NUMBER` | `sr.phone` | mobiles 06x and geographic numbers 01x–03x; `+381` / `00381` / `0`; separators space, `/`, `.`, `-` | mobiles yes (0.55); geographic numbers need context |

Phones carry `attrs.country = "RS"`.

## Sources behind the validators

- **JMBG**: Zakon o jedinstvenom matičnom broju građana — the DD MM YYY RR
  BBB K structure and the mod-11 check digit (0 when the result is 10 or 11).
  The implementation reproduces the standard published example
  `0101006500006`.
- **PIB**: ISO/IEC 7064 MOD 11,10, as used by Poreska uprava. Validates the
  published company PIB of NIS a.d. (`104052135`), a business identifier.
- **Bank account**: ISO/IEC 7064 MOD 97-10 control digits, per the National
  Bank of Serbia's uniform technical rules for payment orders. Validated on
  the account embedded in the SWIFT IBAN Registry's Serbian example
  (`RS35 2600 0560 1001 6113 79` → `260-0056010016113-79`).
- **Phones**: the national numbering plan (RATEL).

## Behaviour worth knowing

- **Both scripts, one pack — and one known value covers both.** The core
  fold transliterates Cyrillic to Latin on the Serbian standard, so
  `Petar Petrović` passed once as a known value also masks `Петар Петровић`,
  and `рачун`, `račun` and `racun` are the same context word. Latin
  diacritics fold too: `tekuci racun` matches like `tekući račun`.
- **A JMBG is a real date.** 32 January, 31 April and 29 February 1999 are
  refused even with a correct check digit. The date is not compared with
  today, so the same text masks the same way every year (D1).
- **Numbers next to "račun", "PIB" or "faktura" are not phones.** An invoice
  number shaped like a 064 mobile stays readable after "faktura".
- **The JMBG reveals more than identity.** It encodes the date of birth,
  the region and the sex (serial below 500 is male). determask therefore puts
  no JMBG-derived attribute on findings — they would leak exactly that.
- All examples and test values are synthetic, except the two published
  business identifiers above.

## Not covered yet

- **Names and addresses**: Serbian name rules (-ić / -ović / -ević surnames,
  honorifics) and address chains — use `knownValues` until then.
- Identity card and passport numbers, licence plates, the company
  registration number (matični broj, 8 digits), dates of birth in prose.
- **libphonenumber-js**: as in pack-vi, this first version uses the numbering
  plan directly, with no dependency.
