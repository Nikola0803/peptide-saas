export const HALLOWEEN_BOGO_PROMOTION_ID = "HALLOWEEN_BOGO_2026";
export const HALLOWEEN_BOGO_PROMOTION_CODE = "HALLOWEEN-BOGO";
export const HALLOWEEN_BOGO_PROMOTION_LABEL = "Halloween BOGO applied";

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

  const discountCents = items.reduce(
    (sum, item) => sum + Math.floor(Math.max(0, item.quantity) / 2) * item.unitPriceCents,
    0,
  );
  if (discountCents <= 0) return empty("Add a matching second item to unlock BOGO");

  return {
    applies: true as const,
    discountCents,
    subtotalCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    freeUnits: items.reduce((sum, item) => sum + Math.floor(Math.max(0, item.quantity) / 2), 0),
  };
}
