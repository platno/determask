/**
 * Singapore locale pack (en-SG): NRIC/FIN, postal codes, phone numbers and
 * passports. See README.md for sources and what is not covered yet.
 */
import type { Pack } from "@determask/core";
import { nricFin, passport, phone, postalCode } from "./recognizers.js";

export { nricFin, passport, phone, postalCode } from "./recognizers.js";
export { isPostalCode, nricCheckLetter } from "./validators.js";

export const sgPack: Pack = {
  id: "pack-sg",
  locales: ["en-SG"],
  recognizers: [nricFin, postalCode, phone, passport],
};
