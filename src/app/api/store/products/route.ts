import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { slugify } from "@/lib/slugify";

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
  };
  type Group = { groupSlug: string; name: string; variants: Variant[] };

  const groups = new Map<string, Group>();

  for (const m of mappings) {
    const product = m.product;
    const stock = product.supplierProducts[0] ? product.supplierProducts[0].stock : product.masterStock;

    const groupName = product.variantGroup || product.chemicalName;
    const groupSlug = slugify(groupName);
    const existing = groups.get(groupSlug) ?? { groupSlug, name: groupName, variants: [] };

    existing.variants.push({
      slug: m.slug as string,
      sku: product.sku,
      label: product.variantLabel || product.chemicalName,
      priceCents: m.storePriceCents as number,
      inStock: stock > 0,
      coaUrl: product.coas[0]?.url,
    });

    groups.set(groupSlug, existing);
  }

  return NextResponse.json([...groups.values()]);
}
