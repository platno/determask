/**
 * Locale-independent recognizers (M2): email, URL, IP, payment card
 * (Luhn), IBAN (mod-97 with length table).
 *
 * Empty on purpose: M0's exit criterion is CI green on an empty pack.
 * Recognizers land with per-rule true/false-positive samples (D20) and
 * validators cited to their primary specs (CONTRIBUTING.md).
 */
import type { Pack } from "@determask/core";

export const corePack: Pack = {
  id: "pack-core",
  locales: ["*"],
  recognizers: [],
};
