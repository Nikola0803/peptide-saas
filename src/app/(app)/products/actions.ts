"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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

export async function deleteProduct(productId: string) {
  const { organization } = await requireOrg();
  await prisma.product.delete({ where: { id: productId, organizationId: organization.id } });
  revalidatePath("/products");
  redirect("/products");
}

export async function addCoaDocument(productId: string, formData: FormData) {
  await requireOrg();

  const url = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!url) throw new Error("A URL is required");

  await prisma.coaDocument.create({
    data: { productId, url, label: label || null },
  });

  revalidatePath(`/products/${productId}`);
}

export async function removeCoaDocument(productId: string, coaId: string) {
  await requireOrg();
  await prisma.coaDocument.delete({ where: { id: coaId } });
  revalidatePath(`/products/${productId}`);
}
