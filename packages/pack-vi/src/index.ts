/**
 * Vietnamese locale pack (M2). Planned recognizers, in order:
 *
 *   VN_PERSONAL_ID   12-digit CCCD: 63-code province prefix, century/gender
 *                    digit, birth-year check. Since 2025 the same number
 *                    also serves as MST and BHXH/BHYT; the observed label
 *                    is an attribute.
 *   VN_LEGACY_ID_CARD  9-digit CMND, context mandatory.
 *   VN_TAX_CODE      10 digits + optional branch, mod-11 check, context.
 *   VN_HEALTH_INSURANCE_CARD  15-char legacy BHYT code.
 *   VN_SOCIAL_INSURANCE_NUMBER  10 digits, context mandatory.
 *   PHONE_NUMBER     libphonenumber-js (max metadata, VN default) plus
 *                    legacy 11-digit mobiles.
 *   PERSON           surname + honorific/kinship gating, ambiguity lists.
 *   ADDRESS          keyword-driven component chain over the pre- and
 *                    post-2025 gazetteer.
 *   VN_LICENSE_PLATE, VN_PASSPORT, VN_DRIVER_LICENSE, DATE_TIME (day-first).
 *
 * Ports from ntrieuvi97/vipii and hmtrii/vipii (both MIT) with attribution
 * in THIRD_PARTY_NOTICES.md. Validators cite the primary circulars.
 *
 * Empty on purpose: M0's exit criterion is CI green on an empty pack.
 */
import type { Pack } from "@determask/core";

export const viPack: Pack = {
  id: "pack-vi",
  locales: ["vi-VN"],
  recognizers: [],
};
