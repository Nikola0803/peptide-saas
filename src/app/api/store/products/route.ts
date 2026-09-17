import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { slugify } from "@/lib/slugify";
import { utcDateString } from "@/lib/order-engine";
import { getBaseUrl } from "@/lib/base-url";
import { stripDoseSuffix, doseLabel } from "@/lib/dose";

// stripDoseSuffix falls back to stripping a trailing dose/strength ("5mg",
// "10 IU", "500mg") off chemicalName when a product has no explicit
// variantGroup set (e.g. a supplier CSV import that omitted the "name"
// column -- see supplier-import.ts). Without this, "BPC-157 5mg" /
// "BPC-157 10mg" / "BPC-157 20mg" each hash to their own one-item group
// and the storefront shows every dose as a separate card instead of one
// product with a size selector. doseLabel keeps the captured dose instead
// of discarding it, for the per-variant pill label ("5mg", not the whole
// "BPC-157 5MG") when a product has no variantLabel set -- without it, a
// product missing that field fell back to its full chemicalName as the
// pill text, which is how "[BPC-157 5MG][BPC-157 10MG][BPC-157 20MG]"
// ended up rendered as the size-picker instead of "[5mg][10mg][20mg]".
// Both now shared from lib/dose.ts (see its doc comment) rather than
// redefined here.

// product.imageUrl / coaDocument.url are stored as paths relative to the
// CRM app itself (see saveUploadedFile in lib/upload.ts -- an admin
// upload writes "/uploads/<orgId>/<file>", never an absolute URL). This
// feed is consumed by evlv-site, a *different* origin, so handing that
// relative path straight through makes the browser resolve it against
// evlv-site's own domain -- which doesn't have that file, and next/image
// turns the resulting 404 into a 400 from its /_next/image optimizer.
// Absolutize it against the CRM's own public URL so it survives being
// read from another site. Left alone if it's already absolute (external
// image/PDF the CRM was configured with directly).
function absoluteMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const base = getBaseUrl();
  if (!base) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
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
      coaUrl: absoluteMediaUrl(product.coas[0]?.url),
      imageUrl: absoluteMediaUrl(product.imageUrl),
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
