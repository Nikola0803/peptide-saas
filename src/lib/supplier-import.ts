import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";

export interface ImportResult {
  updated: number;
  created: number;
  skipped: { sku: string; reason: string }[];
}

// Shared by both import paths: a supplier importing their own price list
// from /dropship/products, and staff pre-filling one on a supplier's
// behalf from /suppliers/[id] before that supplier even has a login.
// CSV header row required, column order doesn't matter, case-insensitive:
//   sku        (required)
//   wholesale | cost   (required — dollars, not cents; what we owe the supplier)
//   name | product     (optional — the base product name, e.g. "BPC-157".
//                        SKUs sharing the same name become one storefront
//                        product with a size/dose selector across their
//                        "mg" values, instead of separate unrelated listings.)
//   mg                 (optional — the variant/size label, e.g. "10mg";
//                        appended to `name` for the product's chemicalName)
//   retail | price     (optional — dollars; the starting storefront price.
//                        Staff can still override per-product afterwards.)
//   shipping           (optional — dollars, defaults to 0)
//   stock              (optional — defaults to 0)
//
// Unlike a self-service edit of an existing product, importing is allowed
// to create brand-new Product rows -- a dropship partner's price list is
// often the first time EVLV has heard of a given SKU at all, so requiring
// it to already exist in the master catalog would make this useless for
// its actual purpose.
//
// A product with a retail price also gets published to the storefront:
// upserted into StoreMapping for every verified Brand on the org, keyed by
// a slug derived from name+mg (or the SKU when no name is given). This is
// what makes an imported supplier price list actually show up on the site.
export async function importSupplierCsv(organizationId: string, supplierId: string, csvText: string): Promise<ImportResult> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV has no data rows");

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;

  const skuIdx = col("sku");
  const costIdx = col("wholesale", "cost");
  const nameIdx = col("name", "product");
  const mgIdx = col("mg", "strength");
  const retailIdx = col("retail", "price");
  const shippingIdx = col("shipping");
  const stockIdx = col("stock");

  if (skuIdx === -1 || costIdx === -1) {
    throw new Error(
      'CSV must have "sku" and "wholesale" (or "cost") columns — optional: "name"/"product", "mg", "retail"/"price", "shipping", "stock"'
    );
  }

  const result: ImportResult = { updated: 0, created: 0, skipped: [] };

  const brands = await prisma.brand.findMany({ where: { organizationId, verifiedAt: { not: null } } });

  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const sku = cols[skuIdx];
    const cost = Number(cols[costIdx]);
    const name = nameIdx >= 0 ? cols[nameIdx] : "";
    const mg = mgIdx >= 0 ? cols[mgIdx] : "";
    const retail = retailIdx >= 0 ? Number(cols[retailIdx] || 0) : 0;
    const shipping = shippingIdx >= 0 ? Number(cols[shippingIdx] || 0) : 0;
    const stock = stockIdx >= 0 ? Math.max(0, Math.floor(Number(cols[stockIdx] || 0))) : 0;

    if (!sku) continue;
    if (!(cost > 0)) {
      result.skipped.push({ sku, reason: "missing/invalid wholesale cost" });
      continue;
    }

    const retailPriceCents = retail > 0 ? Math.round(retail * 100) : null;
    const variantGroup = name || null;
    const variantLabel = mg || null;

    let product = await prisma.product.findFirst({ where: { organizationId, sku } });
    if (!product) {
      const chemicalName = [name, mg].filter(Boolean).join(" ").trim() || sku;
      product = await prisma.product.create({
        data: {
          organizationId,
          sku,
          chemicalName,
          cogsCents: Math.round(cost * 100),
          masterStock: 0,
          variantGroup,
          variantLabel,
          retailPriceCents,
        },
      });
      result.created += 1;
    } else if (retailPriceCents != null || variantGroup || variantLabel) {
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          ...(retailPriceCents != null ? { retailPriceCents } : {}),
          ...(variantGroup ? { variantGroup } : {}),
          ...(variantLabel ? { variantLabel } : {}),
        },
      });
    }

    await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId: product.id } },
      update: { costCents: Math.round(cost * 100), shippingCents: Math.round(shipping * 100), stock, active: true },
      create: {
        supplierId,
        productId: product.id,
        costCents: Math.round(cost * 100),
        shippingCents: Math.round(shipping * 100),
        stock,
        active: true,
      },
    });
    result.updated += 1;

    if (retailPriceCents != null && brands.length > 0) {
      const slugBase = [name, mg].filter(Boolean).join(" ") || sku;
      const slug = slugify(slugBase);
      for (const brand of brands) {
        await prisma.storeMapping.upsert({
          where: { brandId_slug: { brandId: brand.id, slug } },
          update: { storePriceCents: retailPriceCents, active: true, productId: product.id },
          create: {
            brandId: brand.id,
            productId: product.id,
            externalProductId: sku,
            slug,
            storePriceCents: retailPriceCents,
            active: true,
          },
        });
      }
    }
  }

  return result;
}
