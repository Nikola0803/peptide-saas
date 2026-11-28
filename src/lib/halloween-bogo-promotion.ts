export const HALLOWEEN_BOGO_PROMOTION_ID = "HALLOWEEN_BOGO_2026";
export const HALLOWEEN_BOGO_PROMOTION_CODE = "BOGOFRIDAY";
export const HALLOWEEN_BOGO_PROMOTION_LABEL = "Black Friday BOGO applied";
// Black Friday / Cyber Monday extension — runs Nov 6 through Nov 30 (Cyber Monday)
export const EVLV_HALLOWEEN_STARTS_AT = new Date("2026-11-06T06:00:00.000Z");
export const EVLV_HALLOWEEN_ENDS_AT = new Date("2026-12-01T07:59:59.000Z");

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

  // Expand every unit across all products and make the cheapest half free:
  // out of N eligible units, the floor(N/2) lowest-priced units cost $0.
  // e.g. 4 vials [$96, $84, $28, $14.50] -> the 2 cheapest ($28 + $14.50)
  // are free. 2 vials -> the cheaper one is free; 10 vials -> the 5 cheapest.
  const allPrices: number[] = [];
  for (const item of items) {
    for (let i = 0; i < Math.max(0, item.quantity); i++) {
      allPrices.push(item.unitPriceCents);
    }
  }
  allPrices.sort((a, b) => a - b);
  const freeUnits = Math.floor(allPrices.length / 2);
  const discountCents = allPrices.slice(0, freeUnits).reduce((sum, price) => sum + price, 0);
  if (discountCents <= 0) return empty("Add at least 2 items to unlock BOGO");

  return {
    applies: true as const,
    discountCents,
    subtotalCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    freeUnits,
  };
}
