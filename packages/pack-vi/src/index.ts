/**
 * Vietnamese locale pack: the 12-digit personal ID (CCCD), the legacy
 * 9-digit ID card (CMND), the enterprise tax code (MST), the health
 * insurance card (BHYT), the social insurance number (BHXH) and phone
 * numbers. See README.md for sources and what is not covered yet.
 */
import type { Pack } from "@determask/core";
import { healthInsuranceCard, legacyIdCard, personalId, phone, socialInsuranceNumber, taxCode } from "./recognizers.js";

export { healthInsuranceCard, legacyIdCard, personalId, phone, socialInsuranceNumber, taxCode } from "./recognizers.js";
export { CCCD_PROVINCE_CODES, isCccd, isMst } from "./validators.js";

export const viPack: Pack = {
  id: "pack-vi",
  locales: ["vi-VN"],
  recognizers: [personalId, legacyIdCard, taxCode, healthInsuranceCard, socialInsuranceNumber, phone],
};
