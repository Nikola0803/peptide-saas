// Stock gate: makes a storefront sell only what is actually in stock,
// without turning on full inventory counting.
//
// EVLV (and Zoonetics) run as "always available" catalogs: checkout never
// checks or decrements stock for them (see bypassInventory in
// order-engine.ts and /api/store/products). The gate keeps that behaviour
// (no decrement, no stock release job) but treats a product whose
// available stock is 0 or less as sold out: the product feed reports
// inStock=false (so the storefront shows "Notify me" instead of Add to
// cart) and checkout refuses it.
//
// Off unless STOCK_GATE_BRANDS lists the brand, by slug or domain,
// comma separated, e.g. STOCK_GATE_BRANDS=evlv or
// STOCK_GATE_BRANDS=evlvpeptides.com. Set stock first
// (npm run db:stock:evlv -- --apply), then turn the gate on, otherwise
// every product with masterStock 0 shows as sold out.

const normalize = (value: string) => value.trim().toLowerCase().replace(/^www\./, "");

export function stockGateBrands(): Set<string> {
  return new Set(
    (process.env.STOCK_GATE_BRANDS ?? "")
      .split(",")
      .map(normalize)
      .filter(Boolean),
  );
}

export function stockGateEnabled(brand: { slug?: string | null; domain?: string | null } | null | undefined): boolean {
  if (!brand) return false;
  const brands = stockGateBrands();
  if (brands.size === 0) return false;
  return [brand.slug, brand.domain].some((value) => !!value && brands.has(normalize(value)));
}
