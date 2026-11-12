export function getQuantityDiscountPercent(quantity: number): number {
  if (quantity >= 10) return 10;
  if (quantity >= 5) return 7;
  if (quantity >= 3) return 3;
  return 0;
}

export function getQuantityUnitPriceCents(retailPriceCents: number, quantity: number): number {
  const savePercent = getQuantityDiscountPercent(quantity);
  return Math.round((retailPriceCents * (100 - savePercent)) / 100);
}

export function getRetailUnitPriceCents(
  retailPriceCents: number,
  quantity: number,
  retailCasePriceCents?: number | null,
): number {
  if (retailCasePriceCents != null && quantity >= 10 && quantity % 10 === 0) {
    if (retailCasePriceCents % 10 !== 0) {
      throw new Error("Retail 10-pack total must divide evenly into ten unit prices");
    }
    return retailCasePriceCents / 10;
  }
  return getQuantityUnitPriceCents(retailPriceCents, quantity);
}
