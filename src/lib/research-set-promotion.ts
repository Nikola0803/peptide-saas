export const RESEARCH_SET_PROMOTION_CODE = "RESEARCHSET30";
export const RESEARCH_SET_PROMOTION_ID = "RESEARCH_SET_OCT_2026";
export const RESEARCH_SET_PROMOTION_LABEL = "Build Your Research Set — 30% off";

const MINIMUM_ITEM_COUNT = 3;
const DISCOUNT_PERCENT = 30;

export interface ResearchSetPromotionItem {
  quantity: number;
  unitPriceCents: number;
  cogsCents: number;
}

export interface ResearchSetPromotionResult {
  applies: boolean;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
  flooredByMargin: boolean;
  reason?: string;
}

export function evaluateResearchSetPromotion(
  items: ResearchSetPromotionItem[],
  options: {
    active: boolean;
    startsAt?: Date | null;
    endsAt?: Date | null;
    now?: Date;
    isWholesale?: boolean;
    minimumMarginPercent?: number;
  }
): ResearchSetPromotionResult {
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.unitPriceCents * Math.max(1, Math.floor(item.quantity)),
    0
  );
  const empty = (reason: string): ResearchSetPromotionResult => ({
    applies: false,
    discountCents: 0,
    subtotalCents,
    totalCents: subtotalCents,
    flooredByMargin: false,
    reason,
  });

  if (!options.active) return empty("Promotion is not active");

  const now = (options.now ?? new Date()).getTime();
  if (options.startsAt && now < options.startsAt.getTime()) return empty("Promotion has not started yet");
  if (options.endsAt && now >= options.endsAt.getTime()) return empty("Promotion has ended");

  if (options.isWholesale) return empty("Wholesale pricing cannot be combined with this promotion");

  const totalQuantity = items.reduce((sum, item) => sum + Math.max(1, Math.floor(item.quantity)), 0);
  if (totalQuantity < MINIMUM_ITEM_COUNT) {
    return empty(`Add ${MINIMUM_ITEM_COUNT} or more items to your set to qualify`);
  }

  const requestedDiscountCents = Math.round(subtotalCents * (DISCOUNT_PERCENT / 100));

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
