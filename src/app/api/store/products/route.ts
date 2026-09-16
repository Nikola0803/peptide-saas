import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { slugify } from "@/lib/slugify";
import { utcDateString } from "@/lib/order-engine";

// Falls back to stripping a trailing dose/strength ("5mg", "10 IU", "500mg")
// off chemicalName when a product has no explicit variantGroup set (e.g.
// a supplier CSV import that omitted the "name" column -- see
// supplier-import.ts). Without this, "BPC-157 5mg" / "BPC-157 10mg" /
// "BPC-157 20mg" each hash to their own one-item group and the storefront
// shows every dose as a separate card instead of one product with a size
// selector.
const DOSE_SUFFIX_RE = /\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|ug|iu|ml|g))\.?\s*$/i;

function stripDoseSuffix(name: string): string {
  return name.replace(DOSE_SUFFIX_RE, "").trim() || name;
}

// Same idea as stripDoseSuffix, but keeps the captured dose instead of
// discarding it -- for the per-variant pill label ("5mg", not the whole
// "BPC-157 5MG") when a product has no variantLabel set. Without this,
// any product missing that field falls back to its full chemicalName as
// the pill text, which is how "[BPC-157 5MG][BPC-157 10MG][BPC-157 20MG]"
// ended up rendered as the size-picker instead of "[5mg][10mg][20mg]".
function doseLabel(name: string): string | null {
  const m = name.match(DOSE_SUFFIX_RE);
  return m ? m[1].replace(/\s+/g, "").toLowerCase() : null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/store/products — the live product feed a headless storefront
// (evlv-site) reads to build its shop grid, replacing what used to be a
// hardcoded mock catalog. Availability mirrors runCheckout's stock
// resolution in order-engine.ts: a dropshipped product's real stock is its
// active SupplierProduct.stock, not Product.masterStock (which is 0 for
// anything EVLV never physically holds).
//
// Products sharing the same variantGroup (see supplier-import.ts) are
// grouped into one storefront entry with a `variants` array, so a price
// list with "BPC-157" at 5mg/10mg/20mg becomes one product page with a
// size selector instead of three unrelated listings.
export async function GET(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const mappings = await prisma.storeMapping.findMany({
    where: { brandId: store.brandId, active: true, slug: { not: null }, storePriceCents: { not: null } },
    include: {
      product: {
        include: {
          coas: { orderBy: { createdAt: "desc" }, take: 1 },
          supplierProducts: { where: { active: true, supplier: { active: true } } },
        },
      },
    },
  });

  type Variant = {
    slug: string;
    sku: string;
    label: string;
    priceCents: number;
    inStock: boolean;
    coaUrl?: string;
    imageUrl?: string;
    shortDescription?: string;
    description?: string;
    purity?: string;
    categoryLabel?: string;
    storageInstructions?: string;
    reconstitutionInstructions?: string;
    // Deal of the Day -- set only when this exact variant has a deal
    // scheduled for today (see StoreMapping.dealDate in schema.prisma).
    // priceCents above is ALREADY the deal price when this is true; the
    // real (pre-deal) price is kept here only so the storefront can show
    // a crossed-out "was" price, matching what checkout actually charges.
    isDeal?: boolean;
    regularPriceCents?: number;
  };
  type Group = { groupSlug: string; name: string; variants: Variant[] };

  const groups = new Map<string, Group>();
  const today = utcDateString();

  for (const m of mappings) {
    const product = m.product;
    const stock = product.supplierProducts[0] ? product.supplierProducts[0].stock : product.masterStock;

    const groupName = product.variantGroup || stripDoseSuffix(product.chemicalName);
    const groupSlug = slugify(groupName);
    const existing = groups.get(groupSlug) ?? { groupSlug, name: groupName, variants: [] };

    const isDeal = m.dealDate === today && m.dealPriceCents != null;
    const regularPriceCents = m.storePriceCents as number;

    existing.variants.push({
      slug: m.slug as string,
      sku: product.sku,
      label: product.variantLabel || doseLabel(product.chemicalName) || product.chemicalName,
      priceCents: isDeal ? (m.dealPriceCents as number) : regularPriceCents,
      inStock: stock > 0,
      coaUrl: product.coas[0]?.url,
      imageUrl: product.imageUrl ?? undefined,
      shortDescription: product.shortDescription ?? undefined,
      description: product.description ?? undefined,
      purity: product.purity ?? undefined,
      categoryLabel: product.categoryLabel ?? undefined,
      storageInstructions: product.storageInstructions ?? undefined,
      reconstitutionInstructions: product.reconstitutionInstructions ?? undefined,
      isDeal: isDeal || undefined,
      regularPriceCents: isDeal ? regularPriceCents : undefined,
    });

    groups.set(groupSlug, existing);
  }

  return NextResponse.json([...groups.values()]);
}
