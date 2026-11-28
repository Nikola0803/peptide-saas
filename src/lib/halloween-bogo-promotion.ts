export const HALLOWEEN_BOGO_PROMOTION_ID = "HALLOWEEN_BOGO_2026";
export const HALLOWEEN_BOGO_PROMOTION_CODE = "BOGOFRIDAY";
export const HALLOWEEN_BOGO_PROMOTION_LABEL = "Black Friday BOGO applied";
// Black Friday / Cyber Monday extension — runs Nov 6 through Nov 30 (Cyber Monday)
export const EVLV_HALLOWEEN_STARTS_AT = new Date("2026-11-06T06:00:00.000Z");
export const EVLV_HALLOWEEN_ENDS_AT = new Date("2026-12-01T07:59:59.000Z");

// After Cyber Monday the same automatic slot switches by itself to
// "Buy 2, Get 1 Free": out of N eligible single vials/pens, the floor(N/3)
// cheapest are free. It starts the instant BOGO ends (Mon Nov 30, 11:59:59 PM
// PT) and runs to Sun Dec 6, 11:59:59 PM PT. Same id, same exclusions
// (kits, wholesale, AU, no stacking with codes/HEROES/JOIN25/referrals).
// Must match evlv-site src/lib/promo-offer.ts. Kill switch: EVLV_B2G1_DISABLED=1.
export const EVLV_B2G1_STARTS_AT = EVLV_HALLOWEEN_ENDS_AT;
export const EVLV_B2G1_ENDS_AT = new Date("2026-12-07T07:59:59.000Z");
export const B2G1_PROMOTION_CODE = "B2G1STOCKUP";
export const B2G1_PROMOTION_LABEL = "Buy 2, Get 1 Free applied";
// Optional second tier "Buy 3, Get 2 Free" (5 for the price of 3, the 2
// cheapest free). Off until Nikola says yes; must match the site constant.
export const B3G2_TIER_ENABLED = false;

export type MultiBuyKind = "bogo" | "b2g1";

function b2g1Disabled() {
  return process.env.EVLV_B2G1_DISABLED === "1";
}

/** Free units for N eligible units under each rule (cheapest units are free). */
export function multiBuyFreeUnits(units: number, kind: MultiBuyKind, b3g2 = B3G2_TIER_ENABLED) {
  const n = Math.max(0, Math.floor(units));
  if (kind === "bogo") return Math.floor(n / 2);
  const b2g1 = Math.floor(n / 3);
  if (!b3g2) return b2g1;
  const b3g2Free = Math.floor(n / 5) * 2 + (n % 5 >= 3 ? 1 : 0);
  return Math.max(b2g1, b3g2Free);
}

export function evlvHalloweenPromotionOptions(options: {
  active: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  brandDomain?: string | null;
}) {
  const domain = options.brandDomain?.toLowerCase().replace(/^www\./, "");
  const forceLiveFromCode = domain === "evlvpeptides.com";
  return {
    active: forceLiveFromCode || options.active,
    startsAt: forceLiveFromCode ? EVLV_HALLOWEEN_STARTS_AT : options.startsAt,
    endsAt: forceLiveFromCode ? (b2g1Disabled() ? EVLV_HALLOWEEN_ENDS_AT : EVLV_B2G1_ENDS_AT) : options.endsAt,
    // From this instant the rule is Buy 2, Get 1 Free (EVLV only).
    b2g1From: forceLiveFromCode && !b2g1Disabled() ? EVLV_B2G1_STARTS_AT : null,
    forceLiveFromCode,
  };
}

export interface HalloweenBogoItem {
  quantity: number;
  unitPriceCents: number;
}

export function halloweenPromotionIsLive(options: {
  active: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  now?: number;
}) {
  const now = options.now ?? Date.now();
  if (!options.active) return false;
  if (options.startsAt && now < options.startsAt.getTime()) return false;
  if (options.endsAt && now >= options.endsAt.getTime()) return false;
  return true;
}

/** Which rule the live window is on right now ("bogo" before b2g1From). */
export function multiBuyKind(options: { b2g1From?: Date | null; now?: number }): MultiBuyKind {
  const now = options.now ?? Date.now();
  return options.b2g1From && now >= options.b2g1From.getTime() ? "b2g1" : "bogo";
}

export function multiBuyCode(kind: MultiBuyKind) {
  return kind === "b2g1" ? B2G1_PROMOTION_CODE : HALLOWEEN_BOGO_PROMOTION_CODE;
}

export function multiBuyLabel(kind: MultiBuyKind) {
  return kind === "b2g1" ? B2G1_PROMOTION_LABEL : HALLOWEEN_BOGO_PROMOTION_LABEL;
}

export function evaluateHalloweenBogo(
  items: HalloweenBogoItem[],
  options: { active: boolean; startsAt?: Date | null; endsAt?: Date | null; b2g1From?: Date | null; isWholesale: boolean; now?: number; b3g2?: boolean },
) {
  const kind = multiBuyKind(options);
  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const empty = (reason: string) => ({ applies: false as const, kind, discountCents: 0, subtotalCents, totalCents: subtotalCents, reason });
  if (!halloweenPromotionIsLive(options)) return empty("Promotion is not active");
  if (options.isWholesale) return empty("Wholesale pricing cannot be combined with this promotion");

  // Expand every unit across all products and make the cheapest ones free.
  // BOGO: out of N eligible units, the floor(N/2) lowest-priced cost $0.
  // e.g. 4 vials [$96, $84, $28, $14.50] -> the 2 cheapest ($28 + $14.50)
  // are free. 2 vials -> the cheaper one is free; 10 vials -> the 5 cheapest.
  // B2G1: floor(N/3) cheapest are free (3 -> 1, 6 -> 2, 22 -> 7).
  const allPrices: number[] = [];
  for (const item of items) {
    for (let i = 0; i < Math.max(0, item.quantity); i++) {
      allPrices.push(item.unitPriceCents);
    }
  }
  allPrices.sort((a, b) => a - b);
  const freeUnits = multiBuyFreeUnits(allPrices.length, kind, options.b3g2 ?? B3G2_TIER_ENABLED);
  const discountCents = allPrices.slice(0, freeUnits).reduce((sum, price) => sum + price, 0);
  if (discountCents <= 0) return empty(kind === "b2g1" ? "Add 3 items to get 1 free" : "Add at least 2 items to unlock BOGO");

  return {
    applies: true as const,
    kind,
    code: multiBuyCode(kind),
    label: multiBuyLabel(kind),
    discountCents,
    subtotalCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    freeUnits,
  };
}
