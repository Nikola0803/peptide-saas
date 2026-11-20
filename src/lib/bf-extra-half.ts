// Black Friday "50% on top of 50%": an extra 50% off what the customer still
// pays after the Black Friday BOGO. Only applies while BOGO applies, and only
// to BOGO pairs that stay profitable after it (per-pair COGS check), so a
// cheap-margin product never sells at a loss.
//
// Off unless BF_EXTRA_HALF_MODE is set on the server:
//   off  (default) -- nothing changes
//   code           -- needs the code below (BF_EXTRA_HALF_CODE, default BF50)
//   auto           -- applies to every BOGO cart, no code
// Ends with BOGO (same window), so it can never outlive the sale.

export const BF_EXTRA_HALF_ID = "BF_EXTRA_HALF_2026";
export const BF_EXTRA_HALF_LABEL = "Extra 50% off on top of BOGO";

export type BfExtraHalfMode = "off" | "code" | "auto";

export function bfExtraHalfMode(): BfExtraHalfMode {
  const raw = (process.env.BF_EXTRA_HALF_MODE ?? "off").trim().toLowerCase();
  return raw === "code" || raw === "auto" ? raw : "off";
}

export function bfExtraHalfCode(): string {
  return (process.env.BF_EXTRA_HALF_CODE ?? "BF50").trim().toUpperCase();
}

/** True when the extra discount is switched on and this cart qualifies to try it. */
export function bfExtraHalfRequested(typedCodes: (string | undefined | null)[]): boolean {
  const mode = bfExtraHalfMode();
  if (mode === "auto") return true;
  if (mode === "off") return false;
  const code = bfExtraHalfCode();
  return typedCodes.some((c) => (c ?? "").trim().toUpperCase() === code);
}

export interface BfExtraHalfItem {
  quantity: number;
  unitPriceCents: number;
  cogsCents: number;
}

// Card fee (2.9% + 30c) is taken on the whole order, not per pair; count the
// percentage part per pair so a pair is only discounted when it still covers
// its own COGS and its share of the card fee.
const CARD_FEE_RATE = 0.029;

/**
 * Pairs units exactly like evaluateHalloweenBogo (all units sorted by price,
 * highest first; units 0+1, 2+3, ... form a pair, the cheaper one is free).
 * For each pair the customer pays the dearer unit; this takes 50% off that
 * paid unit when the pair still covers both units' COGS afterwards.
 * Odd leftover units (no partner) are never discounted.
 */
export function evaluateBfExtraHalf(items: BfExtraHalfItem[]) {
  const units: { price: number; cogs: number }[] = [];
  for (const item of items) {
    for (let i = 0; i < Math.max(0, item.quantity); i++) {
      units.push({ price: item.unitPriceCents, cogs: Math.max(0, item.cogsCents) });
    }
  }
  // Same order as the BOGO (price desc); tie-break on COGS so the result is stable.
  units.sort((a, b) => b.price - a.price || b.cogs - a.cogs);

  let discountCents = 0;
  let discountedPairs = 0;
  let skippedPairs = 0;
  for (let i = 0; i + 1 < units.length; i += 2) {
    const paid = units[i];
    const free = units[i + 1];
    const extra = Math.floor(paid.price / 2);
    const charged = paid.price - extra;
    const pairProfit = charged - paid.cogs - free.cogs - Math.ceil(charged * CARD_FEE_RATE);
    // Unknown cost (0) is never treated as free stock.
    // Keep at least $1 or 10% of what is charged, whichever is more.
    const floor = Math.max(100, Math.ceil(charged * 0.1));
    if (paid.cogs > 0 && free.cogs > 0 && pairProfit >= floor) {
      discountCents += extra;
      discountedPairs += 1;
    } else {
      skippedPairs += 1;
    }
  }
  return { applies: discountCents > 0, discountCents, discountedPairs, skippedPairs };
}
