"use server";

import { revalidatePath } from "next/cache";
import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { importSupplierCsv, type ImportResult } from "@/lib/supplier-import";
import { saveUploadedFile } from "@/lib/upload";
import { sendTemplate } from "@/lib/email";

export type { ImportResult };

// Lets a supplier upload the real lab COA for one of his own products --
// he's often the one who actually has the lab results. Starts unpublished
// (see CoaDocument.published's doc comment): staff review and publish it
// from the product page before it's customer-facing. Scoped to products he
// actually lists so he can't attach a COA to something that isn't his.
export async function addSupplierCoaDocument(productId: string, formData: FormData) {
  const { supplier, organization } = await requireSupplier();

  const owns = await prisma.supplierProduct.findFirst({ where: { supplierId: supplier.id, productId }, include: { product: true } });
  if (!owns) throw new Error("Not found");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file first");
  const label = String(formData.get("label") ?? "").trim();

  const result = await saveUploadedFile(organization.id, file);
  if (!result.ok) throw new Error(result.reason);

  await prisma.coaDocument.create({
    data: { productId, url: result.media.url, label: label || null, mediaId: result.media.id, published: false, uploadedBySupplierId: supplier.id },
  });

  if (organization.notifyEmail) {
    sendTemplate(organization.id, "supplier_coa_uploaded", organization.notifyEmail, {
      supplierName: supplier.name,
      productName: owns.product.chemicalName,
    }).catch((err) => console.error("Supplier COA notification email failed", err));
  }

  revalidatePath("/dropship/products");
}

export async function setSupplierProduct(formData: FormData) {
  const { supplier, organization } = await requireSupplier();

  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const cost = Number(formData.get("cost") ?? 0);
  const shipping = Number(formData.get("shipping") ?? 0);
  const stock = Math.max(0, Math.floor(Number(formData.get("stock") ?? 0)));
  const restockNote = String(formData.get("restockNote") ?? "").trim();
  const restockEtaRaw = String(formData.get("restockEta") ?? "").trim();
  const restockEta = restockEtaRaw ? new Date(restockEtaRaw) : null;

  if (!sku) throw new Error("SKU is required");
  if (!(cost > 0)) throw new Error("Cost must be greater than zero");

  let product = await prisma.product.findFirst({ where: { organizationId: organization.id, sku } });
  if (!product) {
    if (!name) throw new Error(`"${sku}" is a new SKU — enter a product name to add it to the master catalog`);
    product = await prisma.product.create({
      data: { organizationId: organization.id, sku, chemicalName: name, cogsCents: Math.round(cost * 100), masterStock: 0 },
    });
  }

  await prisma.supplierProduct.upsert({
    where: { supplierId_productId: { supplierId: supplier.id, productId: product.id } },
    update: { costCents: Math.round(cost * 100), shippingCents: Math.round(shipping * 100), stock, active: true, restockNote: restockNote || null, restockEta },
    create: {
      supplierId: supplier.id,
      productId: product.id,
      costCents: Math.round(cost * 100),
      shippingCents: Math.round(shipping * 100),
      stock,
      active: true,
      restockNote: restockNote || null,
      restockEta,
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

// CSV columns — see importSupplierCsv's doc comment in src/lib/supplier-import.ts.
// A SKU that doesn't exist yet in the master catalog gets created, not
// skipped -- this is very often the first time EVLV has a given SKU on
// file at all.
export async function importSupplierProducts(formData: FormData): Promise<ImportResult> {
  const { supplier, organization } = await requireSupplier();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("Choose a CSV file first");

  const result = await importSupplierCsv(organization.id, supplier.id, await file.text());
  revalidatePath("/dropship/products");
  return result;
}
