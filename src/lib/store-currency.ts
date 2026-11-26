// Which currency a store's prices, costs and saved order money are in.
// Every store is USD except EVLV Australia, whose StoreMapping prices and
// costs are AUD (see prisma/evlv-au-pricing.json). Order rows have no
// currency column, so the brand decides it.

export type StoreCurrency = "USD" | "AUD";

// Rate from Nikola's Peptide Centre price list (26 Nov 2026). Used only to
// add AUD orders into all-store USD totals on the dashboard.
export const AUD_PER_USD = 1.3889;

export function brandCurrency(brand: { slug?: string | null; domain?: string | null } | null | undefined): StoreCurrency {
  if (!brand) return "USD";
  const domain = brand.domain?.toLowerCase().replace(/^www\./, "");
  return brand.slug?.toLowerCase() === "evlv-au" || domain === "evlvpeptides.com.au" ? "AUD" : "USD";
}

export function toUsdCents(cents: number, currency: StoreCurrency): number {
  return currency === "AUD" ? Math.round(cents / AUD_PER_USD) : cents;
}

// EVLV Australia runs no sitewide events (BOGO, GLP pair, Research Set, kit
// sale): Nikola wants no deep discounts on the AU market, only the mild
// 3/5/10-vial quantity discount. Checkout, coupon preview and the active
// promotions feed all check this.
export function brandAllowsSitewideEvents(brand: { slug?: string | null; domain?: string | null } | null | undefined): boolean {
  return brandCurrency(brand) !== "AUD";
}
