export const GLP_PAIR_PROMOTION_CODE = "GLPPAIR70";
export const GLP_PAIR_PROMOTION_ID = "GLP_PAIR_OCT_2026";
export const GLP_PAIR_PROMOTION_LABEL = "GLP Pair Event — second item 70% off";

const STARTS_AT = Date.parse("2026-10-06T04:00:00.000Z");
const ENDS_AT_EXCLUSIVE = Date.parse("2026-10-13T04:00:00.000Z");
const MINIMUM_POST_DISCOUNT_SUBTOTAL_CENTS = 8000;

export interface GlpPairPromotionItem {
  slug: string;
  quantity: number;
  productId: string;
  regularUnitPriceCents: number;
  cogsCents: number;
}

export interface GlpPairPromotionResult {
  applies: boolean;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
  flooredByMargin: boolean;
  reason?: string;
}

export function isGlpPairEligibleSlug(slug: string): boolean {
  return /^evlv-[123]-\d+mg$/i.test(slug.trim());
}

export function evaluateGlpPairPromotion(
  items: GlpPairPromotionItem[],
  options: {
    now?: Date;
    alreadyRedeemed?: boolean;
    isWholesale?: boolean;
    minimumMarginPercent?: number;
  } = {}
): GlpPairPromotionResult {
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.regularUnitPriceCents * Math.max(1, Math.floor(item.quantity)),
    0
  );
  const empty = (reason: string): GlpPairPromotionResult => ({
    applies: false,
    discountCents: 0,
    subtotalCents,
    totalCents: subtotalCents,
    flooredByMargin: false,
    reason,
  });

  const now = (options.now ?? new Date()).getTime();
  if (now < STARTS_AT || now >= ENDS_AT_EXCLUSIVE) return empty("Promotion is not active");
  if (options.alreadyRedeemed) return empty("Promotion has already been redeemed");
  if (options.isWholesale) return empty("Wholesale pricing cannot be combined with this promotion");

  const qualifying = items
    .filter((item) => isGlpPairEligibleSlug(item.slug) && item.quantity >= 2)
    .sort((a, b) => a.regularUnitPriceCents - b.regularUnitPriceCents)[0];
  if (!qualifying) return empty("Add two of the same eligible GLP item and strength");

  const requestedDiscountCents = Math.round(qualifying.regularUnitPriceCents * 0.7);
  if (subtotalCents - requestedDiscountCents < MINIMUM_POST_DISCOUNT_SUBTOTAL_CENTS) {
    return empty("Qualifying product subtotal must be at least $80 after the promotion");
  }

  const cogsCents = items.reduce(
    (sum, item) => sum + item.cogsCents * Math.max(1, Math.floor(item.quantity)),
    0
  );
  const marginFloorCents = Math.ceil(cogsCents * (1 + (options.minimumMarginPercent ?? 30) / 100));
  const maximumSafeDiscountCents = Math.max(0, subtotalCents - marginFloorCents);
  const discountCents = Math.min(requestedDiscountCents, maximumSafeDiscountCents);
  if (discountCents <= 0) return empty("Promotion is unavailable for this cart");

  return {
    applies: true,
    discountCents,
    subtotalCents,
    totalCents: subtotalCents - discountCents,
    flooredByMargin: discountCents < requestedDiscountCents,
  };
}
