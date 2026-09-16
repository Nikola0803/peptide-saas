"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/upload";

function dollarsToCents(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function createProduct(formData: FormData) {
  const { organization } = await requireOrg();

  const product = await prisma.product.create({
    data: {
      organizationId: organization.id,
      sku: String(formData.get("sku") ?? "").trim(),
      chemicalName: String(formData.get("chemicalName") ?? "").trim(),
      cogsCents: dollarsToCents(String(formData.get("cogs") ?? "0")),
      masterStock: Number(formData.get("masterStock") ?? 0),
    },
  });

  revalidatePath("/products");
  redirect(`/products/${product.id}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  const { organization } = await requireOrg();

  await prisma.product.update({
    where: { id: productId, organizationId: organization.id },
    data: {
      sku: String(formData.get("sku") ?? "").trim(),
      chemicalName: String(formData.get("chemicalName") ?? "").trim(),
      cogsCents: dollarsToCents(String(formData.get("cogs") ?? "0")),
      masterStock: Number(formData.get("masterStock") ?? 0),
    },
  });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// The markup step: whatever a supplier charges (SupplierProduct.costCents,
// set on their own side) has no bearing on what this sets — staff types
// the retail price directly, however they want to mark it up. Creates the
// StoreMapping if this product isn't on that brand's storefront yet
// (common right after a supplier price-list import, which only touches
// the master catalog + SupplierProduct, never pricing).
export async function setStorePrice(productId: string, brandId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Product not found");
  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: organization.id } });
  if (!brand) throw new Error("Brand not found");

  const price = Number(formData.get("price") ?? 0);
  if (!(price > 0)) throw new Error("Price must be greater than zero");
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugInput ? slugify(slugInput) : slugify(product.sku);

  const existing = await prisma.storeMapping.findFirst({ where: { productId, brandId } });
  if (existing) {
    await prisma.storeMapping.update({
      where: { id: existing.id },
      data: { storePriceCents: Math.round(price * 100), slug, active: true },
    });
  } else {
    await prisma.storeMapping.create({
      data: {
        productId,
        brandId,
        externalProductId: slug,
        slug,
        storePriceCents: Math.round(price * 100),
        active: true,
      },
    });
  }

  revalidatePath(`/products/${productId}`);
}

// Pulls a product off one brand's storefront (StoreMapping.active =
// false) without deleting the Product itself -- order history, COAs, and
// supplier links all stay intact, and re-adding it later is just
// setStorePrice again. Use this instead of deleteProduct whenever a
// product just shouldn't be sold right now (inventory correction,
// discontinued SKU, out of stock indefinitely) rather than never having
// existed. evlv-site's live feed (/api/store/products) only reads
// active: true mappings, so this is what actually pulls it off the shop
// grid and homepage.
export async function removeFromStorefront(productId: string, brandId: string) {
  const { organization } = await requireOrg();

  const mapping = await prisma.storeMapping.findFirst({
    where: { productId, brandId, product: { organizationId: organization.id } },
  });
  if (!mapping) throw new Error("Not listed on that storefront");

  await prisma.storeMapping.update({ where: { id: mapping.id }, data: { active: false } });

  revalidatePath(`/products/${productId}`);
}

// Storefront content -- the fields that make this Product a real source
// of truth for evlv-site's shop grid + PDP (see Product.imageUrl etc. in
// schema.prisma), separate from updateProduct's financial/inventory fields
// so this form can be its own card without touching SKU/COGS/stock.
export async function updateProductContent(productId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const str = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v ? v : null;
  };

  await prisma.product.update({
    where: { id: productId, organizationId: organization.id },
    data: {
      shortDescription: str("shortDescription"),
      description: str("description"),
      purity: str("purity"),
      categoryLabel: str("categoryLabel"),
      storageInstructions: str("storageInstructions"),
      reconstitutionInstructions: str("reconstitutionInstructions"),
    },
  });

  revalidatePath(`/products/${productId}`);
}

// Separate from updateProductContent so a plain content edit (no new file
// chosen) never re-runs the upload branch -- mirrors addCoaDocumentFile's
// pattern of one action per file input.
export async function uploadProductImage(productId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file first");

  const result = await saveUploadedFile(organization.id, file);
  if (!result.ok) throw new Error(result.reason);

  await prisma.product.update({ where: { id: productId }, data: { imageUrl: result.media.url } });

  revalidatePath(`/products/${productId}`);
}

export async function deleteProduct(productId: string) {
  const { organization } = await requireOrg();
  await prisma.product.delete({ where: { id: productId, organizationId: organization.id } });
  revalidatePath("/products");
  redirect("/products");
}

export async function addCoaDocument(productId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");

  const url = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!url) throw new Error("A URL is required");

  await prisma.coaDocument.create({
    data: { productId, url, label: label || null },
  });

  revalidatePath(`/products/${productId}`);
}

// Uploads the COA PDF/image straight into the media library (same
// storage path as /media) and links it, instead of requiring an
// already-hosted URL to paste in.
export async function addCoaDocumentFile(productId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file first");
  const label = String(formData.get("label") ?? "").trim();

  const result = await saveUploadedFile(organization.id, file);
  if (!result.ok) throw new Error(result.reason);

  await prisma.coaDocument.create({
    data: { productId, url: result.media.url, label: label || null, mediaId: result.media.id },
  });

  revalidatePath(`/products/${productId}`);
  revalidatePath("/media");
}

export async function removeCoaDocument(productId: string, coaId: string) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");
  const coa = await prisma.coaDocument.findFirst({ where: { id: coaId, productId } });
  if (!coa) throw new Error("Not found");
  await prisma.coaDocument.delete({ where: { id: coaId } });
  revalidatePath(`/products/${productId}`);
}

// "We decide which products show it" -- a supplier-uploaded COA starts
// unpublished (see CoaDocument.published's doc comment); this is that
// review step. Staff-uploaded ones can be unpublished here too if one
// needs pulling without deleting it outright.
export async function setCoaPublished(productId: string, coaId: string, published: boolean) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");
  const coa = await prisma.coaDocument.findFirst({ where: { id: coaId, productId } });
  if (!coa) throw new Error("Not found");
  await prisma.coaDocument.update({ where: { id: coaId }, data: { published } });
  revalidatePath(`/products/${productId}`);
}
