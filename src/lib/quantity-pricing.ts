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
