import type { Coupon } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Coupon discount engine.
 *
 * Separate from Affiliate.couponCode (see the doc comment on
 * Order.couponCode in schema.prisma) -- that field only drives commission
 * attribution and never touches price. This file is the one place that
 * decides how much an order's price actually gets reduced by a real
 * discount coupon, and it is the only place that may go below a coupon's
 * face value: the wholesale-floor guard (Organization.minMarginPercent)
 * always wins over whatever the coupon says.
 *
 * Both /api/store/coupons/validate (a dry-run preview for the storefront)
 * and runCheckout() in order-engine.ts (the real, money-moving path) call
 * into evaluateCoupons() below, so the two can never disagree.
 */

export interface CouponCartItem {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  cogsCents: number;
}

export interface CouponEvaluationResult {
  // Total amount actually knocked off, after the wholesale-floor clamp.
  discountCents: number;
  // The codes that actually contributed (rejected/incompatible codes are
  // left out and explained in `errors` instead).
  appliedCoupons: { id: string; code: string; discountCents: number }[];
  // Any code that couldn't be applied, and why -- surfaced as-is to the
  // storefront by /api/store/coupons/validate.
  errors: { code: string; reason: string }[];
  // True if the raw coupon math wanted a bigger discount than the
  // wholesale-floor guard allowed, and the total was reduced to fit.
  flooredByMargin: boolean;
}

// A single cart unit, expanded out of CouponCartItem.quantity, for BOGO math
// that needs to reason about "the cheapest N individual units" rather than
// whole line items.
interface Unit {
  productId: string;
  unitPriceCents: number;
}

function expandUnits(items: CouponCartItem[]): Unit[] {
  const units: Unit[] = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      units.push({ productId: item.productId, unitPriceCents: item.unitPriceCents });
    }
  }
  return units;
}

/**
 * Look up and validate coupon codes for an order. Returns only the codes
 * that are usable right now (active, in-window, under their redemption
 * cap, order meets minOrderCents) -- anything else comes back in `errors`
 * with a human-readable reason instead of throwing, since a bad promo code
 * should never crash checkout.
 *
 * Stacking: if more than one code is passed, every one of them (both the
 * ones already "kept" and the new one being considered) must have
 * allowStacking = true, or only the first valid one is kept and the rest
 * are rejected with reason "does not allow stacking".
 */
export async function resolveCoupons(
  organizationId: string,
  codes: string[],
  subtotalCents: number
): Promise<{ coupons: Coupon[]; errors: { code: string; reason: string }[] }> {
  const errors: { code: string; reason: string }[] = [];
  const kept: Coupon[] = [];

  const uniqueCodes = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  const now = new Date();

  for (const code of uniqueCodes) {
    const coupon = await prisma.coupon.findFirst({
      where: { organizationId, code: { equals: code, mode: "insensitive" } },
    });

    if (!coupon) {
      errors.push({ code, reason: "Coupon not found" });
      continue;
    }
    if (!coupon.active) {
      errors.push({ code, reason: "Coupon is no longer active" });
      continue;
    }
    if (coupon.startsAt && coupon.startsAt > now) {
      errors.push({ code, reason: "Coupon is not active yet" });
      continue;
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      errors.push({ code, reason: "Coupon has expired" });
      continue;
    }
    if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
      errors.push({ code, reason: "Coupon has reached its redemption limit" });
      continue;
    }
    if (coupon.minOrderCents != null && subtotalCents < coupon.minOrderCents) {
      errors.push({ code, reason: `Order must be at least $${(coupon.minOrderCents / 100).toFixed(2)}` });
      continue;
    }

    if (kept.length > 0) {
      const stackingOk = coupon.allowStacking && kept.every((k) => k.allowStacking);
      if (!stackingOk) {
        errors.push({ code, reason: "This coupon cannot be combined with another coupon" });
        continue;
      }
    }

    kept.push(coupon);
  }

  return { coupons: kept, errors };
}

// Discount contributed by one FIXED or PERCENT coupon, computed against the
// order's current (pre-this-coupon) subtotal.
function flatDiscountCents(coupon: Coupon, remainingSubtotalCents: number): number {
  if (coupon.type === "FIXED") {
    return Math.min(coupon.fixedAmountCents ?? 0, remainingSubtotalCents);
  }
  if (coupon.type === "PERCENT") {
    const pct = coupon.percentOff ?? 0;
    return Math.round((remainingSubtotalCents * pct) / 100);
  }
  return 0;
}

// BOGO discount, computed directly against cart units (not the running
// subtotal, since it needs to know which specific units qualify).
function bogoDiscountCents(coupon: Coupon, items: CouponCartItem[]): number {
  const buyQty = coupon.bogoBuyQuantity ?? 0;
  const getQty = coupon.bogoGetQuantity ?? 0;
  if (buyQty <= 0 || getQty <= 0) return 0;

  const triggerProductId = coupon.bogoTriggerProductId ?? null;
  // No explicit reward product -- default to "same product as the trigger"
  // (the common buy-2-get-1-free-same-item case). If trigger is also
  // unset, this is a storewide "buy X items, get Y items" coupon and the
  // reward pool is the same as the trigger pool: the whole cart.
  const rewardProductId = coupon.bogoRewardProductId ?? triggerProductId;

  const samePool = rewardProductId === triggerProductId;

  const inTriggerPool = (u: Unit) => triggerProductId == null || u.productId === triggerProductId;
  const inRewardPool = (u: Unit) => rewardProductId == null || u.productId === rewardProductId;

  const allUnits = expandUnits(items);

  let rewardUnitsToDiscount: number;
  let rewardPoolUnits: Unit[];

  if (samePool) {
    // Buy+get both draw from the same pool of matching units -- e.g. "buy 2
    // get 1" on BPC-157 means every complete group of 3 BPC-157 units in
    // the cart yields 1 discounted unit, not 1 discount per 2 purchased.
    const pool = allUnits.filter(inTriggerPool);
    const setSize = buyQty + getQty;
    const numSets = Math.floor(pool.length / setSize);
    rewardUnitsToDiscount = numSets * getQty;
    rewardPoolUnits = pool;
  } else {
    const triggerPool = allUnits.filter(inTriggerPool);
    const numSets = Math.floor(triggerPool.length / buyQty);
    const rewardAvailable = numSets * getQty;
    rewardPoolUnits = allUnits.filter(inRewardPool);
    rewardUnitsToDiscount = Math.min(rewardAvailable, rewardPoolUnits.length);
  }

  if (rewardUnitsToDiscount <= 0) return 0;

  // Discount the cheapest qualifying units first -- standard "the free
  // item is the lowest-priced one" retail convention, and the one that
  // costs the merchant the least per redemption.
  const sorted = [...rewardPoolUnits].sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  const discounted = sorted.slice(0, rewardUnitsToDiscount);

  let total = 0;
  for (const unit of discounted) {
    if (coupon.bogoRewardType === "FREE") {
      total += unit.unitPriceCents;
    } else if (coupon.bogoRewardType === "PERCENT_OFF") {
      total += Math.round((unit.unitPriceCents * (coupon.bogoRewardPercent ?? 0)) / 100);
    } else if (coupon.bogoRewardType === "FIXED_OFF") {
      total += Math.min(coupon.bogoRewardFixedCents ?? 0, unit.unitPriceCents);
    }
  }
  return total;
}

/**
 * The single entry point: given a resolved list of Coupon rows (from
 * resolveCoupons above) and the cart's line items, computes the total
 * discount, per-coupon breakdown, and applies the wholesale-floor clamp
 * from Organization.minMarginPercent so the order can never be sold below
 * cost + that minimum margin, however generous the coupon math says to be.
 */
export function evaluateCoupons(
  coupons: Coupon[],
  items: CouponCartItem[],
  minMarginPercent: number
): CouponEvaluationResult {
  const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const cogsCentsTotal = items.reduce((sum, i) => sum + i.cogsCents * i.quantity, 0);

  const applied: { id: string; code: string; discountCents: number }[] = [];
  let runningSubtotal = subtotalCents;

  for (const coupon of coupons) {
    let discount = 0;
    if (coupon.type === "BOGO") {
      discount = bogoDiscountCents(coupon, items);
    } else {
      discount = flatDiscountCents(coupon, runningSubtotal);
    }
    discount = Math.max(0, Math.min(discount, runningSubtotal));
    runningSubtotal -= discount;
    applied.push({ id: coupon.id, code: coupon.code, discountCents: discount });
  }

  const rawDiscountCents = applied.reduce((sum, a) => sum + a.discountCents, 0);

  // Wholesale-price floor: never let the order's total drop below cost
  // plus the org's minimum margin, no matter how many coupons stacked or
  // how generous any single one is. Math.ceil so we round in the
  // merchant's favor when the percentage doesn't divide evenly.
  const minAllowedTotalCents = Math.ceil(cogsCentsTotal * (1 + minMarginPercent / 100));
  const maxAllowedDiscountCents = Math.max(0, subtotalCents - minAllowedTotalCents);

  let discountCents = rawDiscountCents;
  let flooredByMargin = false;
  if (discountCents > maxAllowedDiscountCents) {
    discountCents = maxAllowedDiscountCents;
    flooredByMargin = true;
  }

  // If we had to clamp, scale each coupon's reported contribution down
  // proportionally so the breakdown still sums to the clamped total --
  // purely informational (redemption is still recorded per coupon below),
  // never used to re-derive the charge.
  let appliedCoupons = applied;
  if (flooredByMargin && rawDiscountCents > 0) {
    appliedCoupons = applied.map((a) => ({
      ...a,
      discountCents: Math.round((a.discountCents / rawDiscountCents) * discountCents),
    }));
  }

  return { discountCents, appliedCoupons, errors: [], flooredByMargin };
}
