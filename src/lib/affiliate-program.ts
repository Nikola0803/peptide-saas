export const AFFILIATE_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{3,23}$/;

export const AFFILIATE_LEVELS = [
  { key: "LAUNCH", name: "Launch", minimumRevenueCents: 0 },
  { key: "BUILDER", name: "Builder", minimumRevenueCents: 500_000 },
  { key: "GROWTH", name: "Growth", minimumRevenueCents: 1_500_000 },
  { key: "ELITE", name: "Elite", minimumRevenueCents: 5_000_000 },
] as const;

export function normalizeAffiliateCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function affiliateLevelForRevenue(revenueCents: number) {
  const safeRevenue = Math.max(0, revenueCents);
  let index = 0;
  for (let i = 0; i < AFFILIATE_LEVELS.length; i += 1) {
    if (safeRevenue >= AFFILIATE_LEVELS[i].minimumRevenueCents) index = i;
  }
  const current = AFFILIATE_LEVELS[index];
  const next = AFFILIATE_LEVELS[index + 1] ?? null;
  const progressPercent = next
    ? Math.max(0, Math.min(100, Math.round(((safeRevenue - current.minimumRevenueCents) / (next.minimumRevenueCents - current.minimumRevenueCents)) * 100)))
    : 100;
  return {
    current,
    next,
    progressPercent,
    revenueToNextCents: next ? Math.max(0, next.minimumRevenueCents - safeRevenue) : 0,
  };
}

export function affiliateDiscountCents(
  subtotalCents: number,
  cogsCents: number,
  requestedPercent: number,
  minimumMarginPercent: number,
) {
  const safePercent = Math.max(0, Math.min(30, Math.floor(requestedPercent)));
  const requested = Math.round(subtotalCents * (safePercent / 100));
  const minimumRevenue = Math.ceil(cogsCents * (1 + Math.max(0, minimumMarginPercent) / 100));
  const maximumByMargin = Math.max(0, subtotalCents - minimumRevenue);
  const discountCents = Math.min(requested, maximumByMargin, Math.floor(subtotalCents * 0.3));
  return { discountCents, flooredByMargin: discountCents < requested };
}
