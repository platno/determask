/**
 * Singapore locale pack. Planned recognizers, in order:
 *
 *   SG_NRIC_FIN      NRIC/FIN: prefix letter (S/T for citizens and PRs,
 *                    F/G/M for foreigners) + 7 digits + check letter,
 *                    validated by the published weighted checksum
 *                    (weights 2,7,6,5,4,3,2; prefix-dependent offset and
 *                    letter table). Presidio's SgFinRecognizer (MIT) is
 *                    the porting source, re-verified against public test
 *                    values. The NRIC doubles as the clinical identifier,
 *                    and PDPC's NRIC Advisory Guidelines restrict even
 *                    collecting it — treat as highest sensitivity.
 *   SG_POSTAL_CODE   6 digits. A Singapore postal code identifies a
 *                    single building, so unlike most countries it is a
 *                    strong quasi-identifier on its own; context-gated
 *                    ("Singapore", "S(xxxxxx)" form, address keywords).
 *   ADDRESS          block + street + unit (#NN-NN) + postal code chain;
 *                    the unit-number shape is distinctive and anchors the
 *                    chain.
 *   PHONE_NUMBER     libphonenumber-js (max metadata, SG default):
 *                    8-digit numbers, mobiles starting 8/9, landlines 6,
 *                    +65 prefix.
 *   SG_PASSPORT      letter + 7 digits + check letter (e.g. E-series),
 *                    context mandatory.
 *   SG_VEHICLE_PLATE prefix letters + up to 4 digits + checksum letter
 *                    (e.g. SBA 1234 A), context or structure gated.
 *   SG_UEN           Unique Entity Number — identifies a business, not a
 *                    person; detected as ORGANIZATION attribute only.
 *   PERSON           names across Singapore's communities (Chinese
 *                    surname-first forms, Malay patronymics with bin/
 *                    binte, Tamil names with s/o / d/o) — the s/o and
 *                    bin/binte connectors are strong context anchors.
 *   DATE_TIME        day-first dates, English context words.
 *
 * Context words are English first (en-SG); Malay, Chinese and Tamil
 * context lists can be added without a new pack, since context words are
 * per-language inside a pack (D8).
 *
 * Validators cite primary sources: ICA for NRIC/FIN structure, IMDA's
 * numbering plan for phones, URA/SingPost for postal codes. The NRIC
 * check-letter algorithm is widely published; test vectors use the
 * well-known synthetic values, never real numbers.
 *
 * Empty on purpose: recognizers land with per-rule true/false-positive
 * samples (D20). Entity ids use the SG_ ISO-3166 prefix per the catalogue
 * convention in docs/ARCHITECTURE.md.
 */
import type { Pack } from "@determask/core";

export const sgPack: Pack = {
  id: "pack-sg",
  locales: ["en-SG"],
  recognizers: [],
};
