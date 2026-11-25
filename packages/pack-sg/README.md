# @determask/pack-sg

Singapore locale pack (`en-SG`): NRIC/FIN, postal codes, phone numbers and
passports. Load it with [`@determask/pack-core`](../pack-core) for email,
URL, IP, card and IBAN.

```ts
import { createEngine } from "@determask/core";
import { sgPack } from "@determask/pack-sg";

const engine = createEngine({ configVersion: 1, locales: { primary: "en-SG" } }, { packs: [sgPack] });
```

## What it detects

| Entity | Recognizer | How | Masked without context? |
|---|---|---|---|
| `SG_NRIC_FIN` | `sg.nric-fin` | S/T/F/G/M + 7 digits + check letter | yes — 1.0 with a matching check letter, 0.6 without |
| `SG_POSTAL_CODE` | `sg.postal-code` | 6 digits, sector 01–82; or the `S(123456)` form | the `S(…)` form yes; 6 bare digits need an address word |
| `PHONE_NUMBER` | `sg.phone` | 8 digits starting 3/6/8/9, `+65` / `0065` optional | with the country code yes; 8 bare digits need a phone word |
| `SG_PASSPORT` | `sg.passport` | E or K + 7 digits + letter | no — needs "passport" |

NRIC/FIN findings carry `attrs.checksum` (`"valid"` or `"unverified"`);
phones carry `attrs.country = "SG"`.

## Sources behind the validators

- **NRIC/FIN**: weights 2,7,6,5,4,3,2, offsets +4 (T, G) and +3 (M), and the
  check-letter tables. ⚠️ **ICA has never published the algorithm.** The S/T
  and F/G tables are long-established; the M-series table (FINs issued from
  2022) is community-derived — documented by sg-pii-rules (Apache-2.0) and
  implemented by samliew/singapore-nric and FormSG, while
  presidio-sg-recognizers disagrees at one remainder (8: M instead of J).
- **Postal codes**: SingPost's addressing scheme — the first two digits are
  the postal sector, 01–82.
- **Phones**: IMDA's National Numbering Plan.

## Behaviour worth knowing

- **An NRIC is masked whether or not its check letter matches.** Because
  the algorithm is unpublished and the M series is disputed, a wrong letter
  is not evidence that a string is not an NRIC — even ICA's and PDPC's own
  sample values (`M1234567B`, `S1234567A`) carry non-matching letters. A
  matching letter scores 1.0 and says `checksum: "valid"`; any other letter
  is still masked at 0.6 and says `checksum: "unverified"`. This replaces
  the skeleton's earlier plan to port Presidio's `SgFinRecognizer`, which
  checks no letter at all and two of whose "valid" test values fail the
  check.
- **A postal code is a building.** Every Singapore postal code names one
  building, so it identifies a home on its own — which is why it is masked
  next to an address word, and in the `S(123456)` form, anywhere.
- **No series attribute.** The prefix tells citizen or PR (S, T) from
  foreigner (F, G, M) and the birth century; findings deliberately do not
  carry it.
- All examples and test values are synthetic.

## Not covered yet

- **Names and addresses**: Chinese surname-first forms, Malay `bin` /
  `binte` and Tamil `s/o` / `d/o` connectors as name anchors, and the
  `#NN-NN` unit number as an address anchor — use `knownValues` until then.
- Vehicle plates (with their checksum letter), the UEN (a business number,
  for `ORGANIZATION`), and dates of birth.
- Malay, Chinese and Tamil context words.
- **libphonenumber-js**: as in the other packs, this first version uses the
  numbering plan directly, with no dependency.
