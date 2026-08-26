import { prisma } from "@/lib/prisma";

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
//   wholesale | cost   (required — dollars, not cents)
//   name | product     (optional — used only when the SKU doesn't already
//                        exist and a new master-catalog Product gets
//                        created for it)
//   mg                 (optional — appended to `name` for the new
//                        product's chemicalName, e.g. "KPV" + "10mg")
//   shipping           (optional — dollars, defaults to 0)
//   stock              (optional — defaults to 0)
//
// Unlike a self-service edit of an existing product, importing is allowed
// to create brand-new Product rows -- a dropship partner's price list is
// often the first time EVLV has heard of a given SKU at all, so requiring
// it to already exist in the master catalog would make this useless for
// its actual purpose.
export async function importSupplierCsv(organizationId: string, supplierId: string, csvText: string): Promise<ImportResult> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV has no data rows");

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;

  const skuIdx = col("sku");
  const costIdx = col("wholesale", "cost");
  const nameIdx = col("name", "product");
  const mgIdx = col("mg", "strength");
  const shippingIdx = col("shipping");
  const stockIdx = col("stock");

  if (skuIdx === -1 || costIdx === -1) {
    throw new Error('CSV must have "sku" and "wholesale" (or "cost") columns — optional: "name"/"product", "mg", "shipping", "stock"');
  }

  const result: ImportResult = { updated: 0, created: 0, skipped: [] };

  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const sku = cols[skuIdx];
    const cost = Number(cols[costIdx]);
    const name = nameIdx >= 0 ? cols[nameIdx] : "";
    const mg = mgIdx >= 0 ? cols[mgIdx] : "";
    const shipping = shippingIdx >= 0 ? Number(cols[shippingIdx] || 0) : 0;
    const stock = stockIdx >= 0 ? Math.max(0, Math.floor(Number(cols[stockIdx] || 0))) : 0;

    if (!sku) continue;
    if (!(cost > 0)) {
      result.skipped.push({ sku, reason: "missing/invalid wholesale cost" });
      continue;
    }

    let product = await prisma.product.findFirst({ where: { organizationId, sku } });
    if (!product) {
      const chemicalName = [name, mg].filter(Boolean).join(" ").trim() || sku;
      product = await prisma.product.create({
        data: { organizationId, sku, chemicalName, cogsCents: Math.round(cost * 100), masterStock: 0 },
      });
      result.created += 1;
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
  }

  return result;
}
