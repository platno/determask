/**
 * Locale-independent recognizers: email, URL, IP address, payment card,
 * IBAN. They serve every locale ("*"). See README.md for what each detects
 * and the primary source behind each validator.
 */
import type { Pack } from "@determask/core";
import { creditCard, email, iban, ipv4, ipv6, url } from "./recognizers.js";

export { creditCard, email, iban, ipv4, ipv6, url } from "./recognizers.js";
export { ASSET_EXTENSIONS, cardBrand, ibanChecksum, isIPv4, isIPv6, luhn } from "./validators.js";

export const corePack: Pack = {
  id: "pack-core",
  locales: ["*"],
  recognizers: [email, url, ipv4, ipv6, creditCard, iban],
};
