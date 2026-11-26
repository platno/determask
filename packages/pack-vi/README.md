# @determask/pack-vi

Vietnamese locale pack (`vi-VN`): personal and insurance identifiers, the
enterprise tax code, and phone numbers. Load it with
[`@determask/pack-core`](https://github.com/platno/determask/tree/main/packages/pack-core) for email, URL, IP, card and IBAN.

```ts
import { createEngine } from "@determask/core";
import { viPack } from "@determask/pack-vi";

const engine = createEngine({ configVersion: 1, locales: { primary: "vi-VN" } }, { packs: [viPack] });
```

## What it detects

| Entity | Recognizer | How | Masked without context? |
|---|---|---|---|
| `VN_PERSONAL_ID` | `vi.personal-id` | 12-digit CCCD / số định danh cá nhân, contiguous or grouped 3-3-3-3; province code + century digit | yes (0.6) |
| `VN_LEGACY_ID_CARD` | `vi.legacy-id-card` | 9-digit CMND | no — needs "CMND", "chứng minh", … |
| `VN_TAX_CODE` | `vi.tax-code` | 10-digit MST, optional `-` + 3-digit branch; mod-11 check digit | no — needs "MST", "mã số thuế", … |
| `VN_HEALTH_INSURANCE_CARD` | `vi.health-insurance-card` | 15-character BHYT code: 2 letters, benefit level 1–5, province, 10 digits | yes (0.6) |
| `VN_SOCIAL_INSURANCE_NUMBER` | `vi.social-insurance-number` | 10-digit mã số BHXH | no — needs "BHXH", … |
| `PHONE_NUMBER` | `vi.phone` | mobiles and landlines after the 2018 conversion, `+84` / `0084` / `0`; pre-2018 11-digit mobiles with context | yes, except legacy mobiles |

Phones carry `attrs.country = "VN"`.

## Sources behind the validators

- **CCCD**: Decree 137/2015/ND-CP Art. 13 and Circular 59/2021/TT-BCA
  Art. 7 for the structure; Circular 07/2016/TT-BCA Appendix I for the 63
  province codes (cross-checked against ntrieuvi97/vipii and baoquocte.vn).
  There is no check digit, so this is a structural check.
- **MST**: the mod-11 check digit with weights 31, 29, 23, 19, 17, 13, 7, 5,
  3, as given in the founding research. It validates published enterprise
  codes (Viettel `0100109106`, Vietnam Airlines `0100686209`), which a
  wrong algorithm would pass about one time in eleven. Confirming it against
  the General Department of Taxation's own specification is a ROADMAP open
  item.
- **BHYT**: the 15-character shape per QĐ 1351/QĐ-BHXH, as summarised in the
  founding research.
- **Phones**: the national numbering plan after the 2018 conversion of
  11-digit mobile numbers.

## Behaviour worth knowing

- **The 2025 consolidation.** Since 1 July 2025 the 12-digit personal ID is
  also the personal tax code, and since 1 August 2025 the social and health
  insurance number. So "MST", "BHXH" and "BHYT" are context words for
  `VN_PERSONAL_ID` too. The 10-digit MST and BHXH numbers and the 15-character
  BHYT code stay detectable, because historical records keep them for years.
- **Order ids are not CCCDs.** "Mã đơn hàng 001099012345" and
  "Order ID 079203012345" are not masked: an order, invoice or lot word
  *before* the number rejects it. This is the false positive a Vietnamese
  developer reported with another tool (Presidio with custom recognizers).
- **A tax code is never masked as a phone.** `0791234569` looks like a
  mobile number (prefix 079); after "MST" it is masked as `VN_TAX_CODE`, and
  "MST" before it rejects the phone reading (failure F7).
- **Anti-context words are kept specific.** An anti-context word rejects
  the candidate, so a common word there would be a leak. "lô" alone (it folds
  to "lo", also "worry") and "tài khoản" alone ("tài khoản Zalo 0912…" is a
  phone) are deliberately not on the lists.
- **Labels typed against the number are fine.** `CCCD001099012345`,
  `SĐT0912345678` and `MST0791234569` are found as if they were spaced —
  hand-entered records often drop the space. A phone from the record, passed
  as a known value, is found in the note whatever its grouping
  (`0912.345.678`, `0912 345 678`).
- **Context does not cross another number.** In "CMND 012345678, 7912345678",
  the CMND context belongs to the 9-digit card only.
- **Dates are not checked against today.** A CCCD's birth year is not
  compared with the current date, because then the same text would mask
  differently next year (D1). Over-masking a malformed future year is the
  safe direction.
- All examples and test values are synthetic, except the two published
  enterprise tax codes above, which are business identifiers.

## Not covered yet

- **Names and addresses**: the rule-based name recognizer (surname plus
  honorific or kinship word, ambiguity lists) and the address chain over the
  pre- and post-2025 gazetteer — milestone M2. Until then, pass names and
  addresses as `knownValues`.
- **Dates of birth**, passports, driver's licences (GPLX), licence plates
  and bank account numbers.
- **The BHYT beneficiary-group code table**: any two letters are accepted
  for now.
- **libphonenumber-js**: the founding research recommends it for phones;
  this first version uses the national numbering plan directly, with no
  dependency, and moving to it is a follow-up.
- **NAPAS domestic cards (9704)**: whether they satisfy Luhn is unverified.
