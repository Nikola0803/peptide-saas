"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function addLot(productId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Product not found");

  const lotNumber = String(formData.get("lotNumber") ?? "").trim();
  const quantityReceived = Number(formData.get("quantityReceived") ?? 0);
  const coaUrl = String(formData.get("coaUrl") ?? "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();

  if (!lotNumber || quantityReceived <= 0) throw new Error("Lot number and a positive quantity are required");

  await prisma.productLot.create({
    data: {
      productId,
      lotNumber,
      quantityReceived,
      quantityRemaining: quantityReceived,
      coaUrl: coaUrl || null,
      expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : null,
    },
  });

  revalidatePath(`/products/${productId}`);
}

/**
 * Flags a lot as recalled. Doesn't touch any orders — the point is the
 * flag alone makes every OrderItem pointing at this lot into a recall
 * list, visible at /products/[id]/lots/[lotId]/recall.
 */
export async function recallLot(productId: string, lotId: string, formData: FormData) {
  await requireOrg();

  const reason = String(formData.get("reason") ?? "").trim();

  await prisma.productLot.update({
    where: { id: lotId },
    data: { status: "RECALLED", recalledAt: new Date(), recallReason: reason || null },
  });

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/lots/${lotId}/recall`);
  revalidatePath("/dashboard");
}

export async function unrecallLot(productId: string, lotId: string) {
  await requireOrg();

  await prisma.productLot.update({
    where: { id: lotId },
    data: { status: "ACTIVE", recalledAt: null, recallReason: null },
  });

  revalidatePath(`/products/${productId}`);
}

export async function deleteLot(productId: string, lotId: string) {
  await requireOrg();
  await prisma.productLot.delete({ where: { id: lotId } });
  revalidatePath(`/products/${productId}`);
}
