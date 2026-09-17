// Shared dose-suffix parsing -- used anywhere a product's dose needs
// pulling out of its free-text chemicalName ("BPC-157 10MG" -> 10),
// e.g. the storefront feed's variant grouping/pill labels
// (api/store/products/route.ts) and the VVG fulfillment SKU matcher
// (products/actions.ts's setVvgFulfillmentSkus). One regex, one place,
// so a format tweak doesn't have to be made twice.
export const DOSE_SUFFIX_RE = /\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|ug|iu|ml|g))\.?\s*$/i;

export function stripDoseSuffix(name: string): string {
  return name.replace(DOSE_SUFFIX_RE, "").trim() || name;
}

// Keeps the captured dose instead of discarding it, lowercased/de-spaced
// ("BPC-157 5MG" -> "5mg").
export function doseLabel(name: string): string | null {
  const m = name.match(DOSE_SUFFIX_RE);
  return m ? m[1].replace(/\s+/g, "").toLowerCase() : null;
}

// Just the numeric mg value ("BPC-157 10MG" -> 10, "HCG 5000IU" -> 5000).
// Non-mg units (iu/ml/mcg/g) still parse to their bare number -- callers
// matching against a dose table (which is unit-less, e.g. VVG's sheet)
// need that, not a unit-aware conversion.
export function doseNumber(name: string): number | null {
  const m = name.match(DOSE_SUFFIX_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isNaN(n) ? null : n;
}
