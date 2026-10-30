export const HALLOWEEN_BOGO_PROMOTION_ID = "HALLOWEEN_BOGO_2026";
export const HALLOWEEN_BOGO_PROMOTION_CODE = "HALLOWEEN-BOGO";
export const HALLOWEEN_BOGO_PROMOTION_LABEL = "Halloween BOGO applied";
export const EVLV_HALLOWEEN_STARTS_AT = new Date("2026-10-26T06:00:00.000Z");
export const EVLV_HALLOWEEN_ENDS_AT = new Date("2026-11-01T06:00:00.000Z");

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
    endsAt: forceLiveFromCode ? EVLV_HALLOWEEN_ENDS_AT : options.endsAt,
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

export function evaluateHalloweenBogo(
  items: HalloweenBogoItem[],
  options: { active: boolean; startsAt?: Date | null; endsAt?: Date | null; isWholesale: boolean; now?: number },
) {
  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const empty = (reason: string) => ({ applies: false as const, discountCents: 0, subtotalCents, totalCents: subtotalCents, reason });
  if (!halloweenPromotionIsLive(options)) return empty("Promotion is not active");
  if (options.isWholesale) return empty("Wholesale pricing cannot be combined with this promotion");

  // Expand every unit across all products, sort descending, and make every
  // unit at an odd index (the cheaper half of each adjacent pair) free.
  // This gives the correct cross-product "2nd cheapest of the two is FREE"
  // result: e.g. [$96.67, $66.50, $46.67, $40.00] → pairs (96.67+66.50)
  // and (46.67+40.00) → free $66.50 + $40.00.
  const allPrices: number[] = [];
  for (const item of items) {
    for (let i = 0; i < Math.max(0, item.quantity); i++) {
      allPrices.push(item.unitPriceCents);
    }
  }
  allPrices.sort((a, b) => b - a);
  const discountCents = allPrices.reduce((sum, price, idx) => (idx % 2 === 1 ? sum + price : sum), 0);
  if (discountCents <= 0) return empty("Add at least 2 items to unlock BOGO");

  return {
    applies: true as const,
    discountCents,
    subtotalCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    freeUnits: Math.floor(allPrices.length / 2),
  };
}
