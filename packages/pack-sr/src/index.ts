/**
 * Serbian locale pack (sr-RS, Latin and Cyrillic): JMBG, PIB, bank account
 * numbers, LBO and phone numbers. See README.md for sources and what is not
 * covered yet.
 */
import type { Pack } from "@determask/core";
import { bankAccount, jmbg, lbo, phone, pib } from "./recognizers.js";

export { bankAccount, jmbg, lbo, phone, pib } from "./recognizers.js";
export { isJmbg, isPib, isRsAccount } from "./validators.js";

export const srPack: Pack = {
  id: "pack-sr",
  locales: ["sr-RS", "sr-Latn-RS", "sr-Cyrl-RS"],
  recognizers: [jmbg, pib, bankAccount, lbo, phone],
};
