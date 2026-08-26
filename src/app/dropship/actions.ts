"use server";

import { revalidatePath } from "next/cache";
import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function markItemShipped(orderItemId: string, formData: FormData) {
  const { supplier } = await requireSupplier();

  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim();
  const carrierCode = String(formData.get("carrierCode") ?? "").trim();
  if (!trackingNumber) throw new Error("Tracking number is required");

  const item = await prisma.orderItem.findFirst({
    where: { id: orderItemId, supplierId: supplier.id },
    include: { order: true },
  });
  if (!item) throw new Error("Item not found");

  await prisma.orderItem.update({
    where: { id: orderItemId },
    data: { fulfillmentStatus: "SHIPPED", shippedAt: new Date(), trackingNumber, carrierCode: carrierCode || null },
  });

  // Visible to staff on the order itself, not just in the supplier portal.
  await prisma.orderNote.create({
    data: {
      orderId: item.orderId,
      body: `${supplier.name} shipped "${item.name}" x${item.quantity} — tracking ${trackingNumber}${carrierCode ? ` (${carrierCode})` : ""}`,
    },
  });

  revalidatePath("/dropship");
  revalidatePath(`/orders/${item.orderId}`);
}
