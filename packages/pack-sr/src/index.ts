/**
 * Serbian locale pack. Planned recognizers, in order:
 *
 *   RS_PERSONAL_ID   13-digit JMBG: DDMMYYY date of birth, 2-digit region
 *                    code, 3-digit sequence (000–499 male, 500–999 female),
 *                    mod-11 check digit. The date and gender embedded in
 *                    the number make it high-sensitivity on its own.
 *   RS_HEALTH_INSURANCE_NUMBER  11-digit LBO (lični broj osiguranika,
 *                    RFZO), context-gated.
 *   RS_TAX_CODE      9-digit PIB with mod-11 check; context ("PIB").
 *                    Company matični broj (8 digits, mod-11) is an
 *                    ORGANIZATION attribute, not personal data, but shares
 *                    the validator family.
 *   RS_ID_CARD       9-digit lična karta number, context mandatory.
 *   RS_PASSPORT      9-digit passport number, context mandatory.
 *   RS_BANK_ACCOUNT  XXX-XXXXXXXXXXXXX-XX (bank code + account + mod-97
 *                    control), with and without separators; context for
 *                    the bare-digit form.
 *   PHONE_NUMBER     libphonenumber-js (max metadata, RS default):
 *                    +381 / 0 6x mobiles, geographic landlines.
 *   PERSON           Serbian name rules: -ić/-ović/-ević surname shapes,
 *                    honorifics (g., gđa, dr, prof.), kinship terms.
 *   ADDRESS          keyword-driven chain (ul., bb, broj, sprat, stan,
 *                    opština, naselje) over a municipality gazetteer.
 *   RS_LICENSE_PLATE district code + digits + letters (e.g. BG 123-AB),
 *                    incl. Latin/Cyrillic letter forms.
 *   DATE_TIME        day-first dates, both scripts, DOB context
 *                    ("rođen/rođena", "datum rođenja").
 *
 * Script duality is the defining constraint: the same note may mix
 * Cyrillic and Latin. Matching runs on a folded view that maps Cyrillic
 * to Latin and strips diacritics (ć→c, š→s, ž→z, đ→d, dž/lj/nj digraphs),
 * so known values match across scripts. The core fold already handles
 * diacritics; the Cyrillic→Latin table lands here with the pack.
 *
 * Validators cite primary sources: the JMBG law (Zakon o jedinstvenom
 * matičnom broju građana), NBS decision for account numbers, Poreska
 * uprava for PIB.
 *
 * Empty on purpose: recognizers land with per-rule true/false-positive
 * samples (D20). Entity ids use the RS_ ISO-3166 prefix per the catalogue
 * convention in docs/ARCHITECTURE.md.
 */
import type { Pack } from "@determask/core";

export const srPack: Pack = {
  id: "pack-sr",
  locales: ["sr-RS", "sr-Latn-RS", "sr-Cyrl-RS"],
  recognizers: [],
};
