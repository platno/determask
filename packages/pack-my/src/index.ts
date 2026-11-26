/**
 * Malaysian locale pack (ms-MY, en-MY): the MyKad number, phone numbers
 * and passports. See README.md for sources and what is not covered yet.
 */
import type { Pack } from "@determask/core";
import { nric, passport, phone } from "./recognizers.js";

export { nric, passport, phone } from "./recognizers.js";
export { isMyKadDate, MYKAD_PB_CODES } from "./validators.js";

export const myPack: Pack = {
  id: "pack-my",
  locales: ["ms-MY", "en-MY"],
  recognizers: [nric, phone, passport],
};
