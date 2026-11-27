// EVLV Australia Black Friday to Cyber Monday sale (Nov 2026).
//
// Nikola (27 Nov 2026): the AU site shows "40% off", but the price actually
// charged is only 20% below the regular AU price. The storefront shows the
// sale price with a struck-through "was" price of sale / 0.6, so the badge
// reads 40%. Only this file decides what checkout charges.
//
// While live, every retail AU unit price is the regular StoreMapping price
// minus 20% (no Deal of the Day on top). The normal 3/5/10-vial quantity
// ladder still applies to that sale price, exactly as it does all year. The
// sale owns the discount slot: no coupon, JOIN25, HEROES, referral or partner
// discount is added. Wholesale is untouched. No BOGO, kit tiers or other
// sitewide events on AU (store-currency.ts) are changed by this.
//
// Ends at the same moment as the US Black Friday sale (Mon Nov 30,
// 11:59:59 PM PT) and reverts by itself. Kill switch: AU_BF_SALE_DISABLED=1.
import { brandCurrency } from "./store-currency";

export const AU_BF_SALE_PROMOTION_ID = "AU_BF40_2026";
export const AU_BF_SALE_PROMOTION_CODE = "AUBF40";
export const AU_BF_SALE_LABEL = "Black Friday 40% off";
export const AU_BF_SALE_STARTS_AT = new Date("2026-11-27T00:00:00.000Z");
// Same cutoff as the US BOGO and kit sale (kit-tier-promotion.ts).
export const AU_BF_SALE_ENDS_AT = new Date("2026-12-01T07:59:59.000Z");
// What is really taken off the regular price.
export const AU_BF_CHARGED_PERCENT = 20;

export function auBlackFridaySaleIsLive(now = Date.now()): boolean {
  if (process.env.AU_BF_SALE_DISABLED === "1") return false;
  return now >= AU_BF_SALE_STARTS_AT.getTime() && now < AU_BF_SALE_ENDS_AT.getTime();
}

export function auBlackFridaySaleApplies(
  brand: { slug?: string | null; domain?: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  return brandCurrency(brand) === "AUD" && auBlackFridaySaleIsLive(now);
}

/** Regular single-vial price in cents -> sale single-vial price in cents. */
export function auBlackFridayUnitPriceCents(regularCents: number): number {
  return Math.round((regularCents * (100 - AU_BF_CHARGED_PERCENT)) / 100);
}
