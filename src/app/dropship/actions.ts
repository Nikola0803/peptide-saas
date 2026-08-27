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

  // The order-level shippedAt/trackingNumber/carrierCode (used by the main
  // CRM's Shipping page and the shipping_confirmation email automation)
  // otherwise only ever gets set by the ShipStation sync -- a dropship
  // supplier marking his own item shipped never reached it, so his
  // shipments were invisible outside the supplier portal and never
  // triggered the customer email. Once every item on the order is
  // shipped, propagate here too. Orders only have one tracking
  // number/carrier slot; if this order's items ended up with different
  // trackings (multi-supplier), leave those blank rather than picking one
  // arbitrarily -- shippedAt still gets set, so the order shows as
  // shipped and the email still fires, just without a single tracking
  // link (each item's own tracking is still on the order's notes/items).
  const allItems = await prisma.orderItem.findMany({ where: { orderId: item.orderId } });
  const allShipped = allItems.every((i) => i.fulfillmentStatus === "SHIPPED");
  if (allShipped && !item.order.shippedAt) {
    const distinctTracking = new Set(allItems.map((i) => i.trackingNumber).filter(Boolean));
    const distinctCarrier = new Set(allItems.map((i) => i.carrierCode).filter(Boolean));
    await prisma.order.update({
      where: { id: item.orderId },
      data: {
        shippedAt: new Date(),
        trackingNumber: distinctTracking.size === 1 ? [...distinctTracking][0] : null,
        carrierCode: distinctCarrier.size === 1 ? [...distinctCarrier][0] : null,
      },
    });
  }

  revalidatePath("/dropship");
  revalidatePath(`/orders/${item.orderId}`);
  revalidatePath("/shipping");
}
