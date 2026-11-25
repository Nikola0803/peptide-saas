// Black Friday / Cyber Monday kit sale (EVLV, Nov 2026).
//
// A "kit" is a 10-vial pack of one product, i.e. a cart line whose quantity
// is a whole multiple of 10 and that is priced at the product's retail
// 10-pack price (StoreMapping.retailCasePriceCents). Kits never take BOGO
// (owner rule), at any time. While the sale is live, every kit in the cart
// gets the tier discount for the TOTAL number of kits in the cart, counted
// across products. At 5+ kits the price equals the wholesale case price
// (retail kit = 5x cost, wholesale = 3x cost on the Nov 25 list, so 40% off
// still leaves ~65% margin after the 5% P2P discount). The discount is also
// floored per kit at the wholesale case price when one is set, so a product
// priced differently can never go below wholesale.
//
// While the sale is live and the cart holds any kit, the sale owns the
// discount slot: no coupon, HEROES, JOIN25, referral or partner discount is
// added on top. Single vials in the same cart can still take BOGO among
// themselves.

export const KIT_TIER_PROMOTION_ID = "BF_KIT_TIERS_2026";
export const KIT_TIER_PROMOTION_CODE = "BFKITS";
export const KIT_TIER_PROMOTION_LABEL = "Black Friday kit pricing";
export const KIT_TIER_STARTS_AT = new Date("2026-11-25T00:00:00.000Z");
// Same cutoff as the BOGO event: Mon Nov 30, 11:59:59 PM PT.
export const KIT_TIER_ENDS_AT = new Date("2026-12-01T07:59:59.000Z");
export const KIT_SIZE = 10;

export const KIT_TIERS = [
  { kits: 1, percent: 0 },
  { kits: 2, percent: 10 },
  { kits: 3, percent: 20 },
  { kits: 4, percent: 30 },
  { kits: 5, percent: 40 },
] as const;

export function kitSaleIsLive(now = Date.now()): boolean {
  if (process.env.KIT_TIERS_DISABLED === "1") return false;
  return now >= KIT_TIER_STARTS_AT.getTime() && now < KIT_TIER_ENDS_AT.getTime();
}

export function isKitLine(quantity: number, retailCasePriceCents?: number | null): boolean {
  return retailCasePriceCents != null && quantity >= KIT_SIZE && quantity % KIT_SIZE === 0;
}

export function kitTierPercent(totalKits: number): number {
  let percent = 0;
  for (const tier of KIT_TIERS) if (totalKits >= tier.kits) percent = tier.percent;
  return percent;
}

export interface KitTierItem {
  quantity: number;
  unitPriceCents: number;
  // Wholesale 10-vial case price; the per-kit floor.
  wholesaleCasePriceCents?: number | null;
}

export function evaluateKitTiers(
  kitItems: KitTierItem[],
  options: { isWholesale: boolean; now?: number },
) {
  const totalKits = kitItems.reduce((sum, item) => sum + Math.floor(item.quantity / KIT_SIZE), 0);
  const live = !options.isWholesale && kitSaleIsLive(options.now);
  // The sale owns the cart (blocks other discounts) whenever it is live and
  // there is at least one kit, even at the 0% one-kit tier.
  const ownsCart = live && totalKits > 0;
  const percent = live ? kitTierPercent(totalKits) : 0;
  let discountCents = 0;
  if (percent > 0) {
    for (const item of kitItems) {
      const kits = Math.floor(item.quantity / KIT_SIZE);
      const kitPriceCents = item.unitPriceCents * KIT_SIZE;
      let off = Math.round((kitPriceCents * percent) / 100);
      if (item.wholesaleCasePriceCents != null) {
        off = Math.min(off, Math.max(0, kitPriceCents - item.wholesaleCasePriceCents));
      }
      discountCents += off * kits;
    }
  }
  return { applies: discountCents > 0, ownsCart, totalKits, percent, discountCents };
}
