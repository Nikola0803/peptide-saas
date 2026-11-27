// Black Friday "free BAC water today" gift (EVLV US + AU, Nov 27 2026).
//
// While the gift is live, one 10 ml bacteriostatic water vial is free on any
// EVLV retail order that also contains at least one other paid product.
// The free unit is split off the cart BEFORE any pricing runs, so it never
// counts toward the subtotal, BOGO pairs, kit tiers, coupons, the free
// shipping threshold or the max-discount guard. It is still saved on the
// order as a $0 line, so it ships and its cost lands in the order profit.
//
// One free vial per order. Wholesale checkouts never get it. Kill switch:
// FREE_BAC_GIFT_DISABLED=1. Ends Fri Nov 27, 11:59:59 PM PT.

export const FREE_BAC_GIFT_SLUG = "bacteriostatic-water-10ml";
export const FREE_BAC_GIFT_PROMOTION_CODE = "FREEBAC";
export const FREE_BAC_GIFT_STARTS_AT = new Date("2026-11-27T00:00:00.000Z");
export const FREE_BAC_GIFT_ENDS_AT = new Date("2026-11-28T07:59:59.000Z");

const EVLV_SLUGS = new Set(["evlv", "evlv-au"]);
const EVLV_DOMAINS = new Set(["evlvpeptides.com", "evlvpeptides.com.au"]);

export function freeBacGiftIsLive(now = Date.now()): boolean {
  if (process.env.FREE_BAC_GIFT_DISABLED === "1") return false;
  return now >= FREE_BAC_GIFT_STARTS_AT.getTime() && now < FREE_BAC_GIFT_ENDS_AT.getTime();
}

export function brandGetsFreeBacGift(brand: { slug?: string | null; domain?: string | null } | null | undefined): boolean {
  if (!brand) return false;
  const slug = brand.slug?.toLowerCase() ?? "";
  const domain = brand.domain?.toLowerCase().replace(/^www\./, "") ?? "";
  return EVLV_SLUGS.has(slug) || EVLV_DOMAINS.has(domain);
}

export interface GiftCartItem {
  slug: string;
  quantity: number;
}

/**
 * Takes one BAC water unit out of the cart when the gift applies. Returns the
 * items to price normally and the gift line (or null). A line that is a whole
 * 10-pack is never split, so a BAC kit stays a kit.
 */
export function splitFreeBacGift<T extends GiftCartItem>(
  items: T[],
  options: { brand: { slug?: string | null; domain?: string | null } | null | undefined; isWholesale?: boolean; now?: number },
): { items: T[]; gift: GiftCartItem | null } {
  if (options.isWholesale || !brandGetsFreeBacGift(options.brand) || !freeBacGiftIsLive(options.now)) {
    return { items, gift: null };
  }
  const hasOtherPaidItem = items.some((item) => item.slug !== FREE_BAC_GIFT_SLUG && Math.floor(item.quantity) > 0);
  if (!hasOtherPaidItem) return { items, gift: null };

  const index = items.findIndex((item) => {
    const qty = Math.floor(item.quantity);
    return item.slug === FREE_BAC_GIFT_SLUG && qty > 0 && qty % 10 !== 0;
  });
  if (index < 0) return { items, gift: null };

  const next = items.map((item) => ({ ...item }));
  const qty = Math.floor(next[index].quantity) - 1;
  if (qty <= 0) next.splice(index, 1);
  else next[index].quantity = qty;
  return { items: next, gift: { slug: FREE_BAC_GIFT_SLUG, quantity: 1 } };
}
