"use server";

import { revalidatePath } from "next/cache";
import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function setSupplierProduct(formData: FormData) {
  const { supplier, organization } = await requireSupplier();

  const sku = String(formData.get("sku") ?? "").trim();
  const cost = Number(formData.get("cost") ?? 0);
  const shipping = Number(formData.get("shipping") ?? 0);
  const stock = Math.max(0, Math.floor(Number(formData.get("stock") ?? 0)));

  if (!sku) throw new Error("SKU is required");
  if (!(cost > 0)) throw new Error("Cost must be greater than zero");

  const product = await prisma.product.findFirst({ where: { organizationId: organization.id, sku } });
  if (!product) throw new Error(`No product with SKU "${sku}" exists in the master catalog — ask staff to add it first`);

  await prisma.supplierProduct.upsert({
    where: { supplierId_productId: { supplierId: supplier.id, productId: product.id } },
    update: { costCents: Math.round(cost * 100), shippingCents: Math.round(shipping * 100), stock, active: true },
    create: {
      supplierId: supplier.id,
      productId: product.id,
      costCents: Math.round(cost * 100),
      shippingCents: Math.round(shipping * 100),
      stock,
      active: true,
    },
  });

  revalidatePath("/dropship/products");
}

export async function setSupplierProductActive(supplierProductId: string, active: boolean) {
  const { supplier } = await requireSupplier();
  await prisma.supplierProduct.updateMany({
    where: { id: supplierProductId, supplierId: supplier.id },
    data: { active },
  });
  revalidatePath("/dropship/products");
}

export interface ImportResult {
  updated: number;
  skipped: { sku: string; reason: string }[];
}

// CSV columns (header row required, order doesn't matter): sku, cost,
// shipping, stock. cost/shipping are dollar amounts (e.g. "12.50"), not
// cents. Every row's SKU must already exist in the master catalog --
// suppliers pick from what EVLV already lists, they don't create new
// products by importing.
export async function importSupplierProducts(formData: FormData): Promise<ImportResult> {
  const { supplier, organization } = await requireSupplier();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("Choose a CSV file first");

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV has no data rows");

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const skuIdx = header.indexOf("sku");
  const costIdx = header.indexOf("cost");
  const shippingIdx = header.indexOf("shipping");
  const stockIdx = header.indexOf("stock");
  if (skuIdx === -1 || costIdx === -1) throw new Error('CSV must have "sku" and "cost" columns (optional: "shipping", "stock")');

  const result: ImportResult = { updated: 0, skipped: [] };

  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const sku = cols[skuIdx];
    const cost = Number(cols[costIdx]);
    const shipping = shippingIdx >= 0 ? Number(cols[shippingIdx] || 0) : 0;
    const stock = stockIdx >= 0 ? Math.max(0, Math.floor(Number(cols[stockIdx] || 0))) : 0;

    if (!sku) continue;
    if (!(cost > 0)) {
      result.skipped.push({ sku, reason: "missing/invalid cost" });
      continue;
    }

    const product = await prisma.product.findFirst({ where: { organizationId: organization.id, sku } });
    if (!product) {
      result.skipped.push({ sku, reason: "no matching product in master catalog" });
      continue;
    }

    await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId: supplier.id, productId: product.id } },
      update: { costCents: Math.round(cost * 100), shippingCents: Math.round(shipping * 100), stock, active: true },
      create: {
        supplierId: supplier.id,
        productId: product.id,
        costCents: Math.round(cost * 100),
        shippingCents: Math.round(shipping * 100),
        stock,
        active: true,
      },
    });
    result.updated += 1;
  }

  revalidatePath("/dropship/products");
  return result;
}
