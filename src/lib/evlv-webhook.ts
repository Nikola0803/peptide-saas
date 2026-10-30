import { prisma } from "@/lib/prisma";

const WEBHOOK_URL = process.env.EVLV_WEBHOOK_URL ?? "https://evlvpeptides.com/api/webhooks/crm";

async function fire(event: string, data: Record<string, unknown>): Promise<void> {
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!secret) return;
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ event, data }),
  });
  if (!res.ok) {
    console.error(`[evlv-webhook] ${event} → ${res.status} ${res.statusText}`);
  }
}

export async function fireOrderPlaced(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { contact: true, items: true },
  });
  if (!order || !order.contact?.email) return;

  await fire("order.placed", {
    orderID: order.id,
    email: order.contact.email,
    orderNumber: `EVLV-${order.orderSeq}`,
    orderStatus: "paid",
    paymentStatus: "paid",
    fulfillmentStatus: "unfulfilled",
    currency: "USD",
    orderTotal: (order.grossCents + order.shippingCents) / 100,
    subtotalPrice: order.grossCents / 100,
    shippingPrice: order.shippingCents / 100,
    lineItems: order.items.map((item: { sku: string; name: string; quantity: number; unitPriceCents: number }) => ({
      productID: item.sku,
      sku: item.sku,
      productTitle: item.name,
      quantity: item.quantity,
      price: item.unitPriceCents / 100,
    })),
    createdAt: order.placedAt.toISOString(),
  });
}

export async function fireOrderFulfilled(
  orderId: string,
  tracking?: { trackingCode?: string; carrier?: string }
): Promise<void> {
  await fire("order.fulfilled", { orderID: orderId, tracking });
}

export async function fireOrderCanceled(orderId: string): Promise<void> {
  await fire("order.canceled", { orderID: orderId });
}

export async function fireOrderRefunded(orderId: string): Promise<void> {
  await fire("order.refunded", { orderID: orderId });
}

export async function fireContactCreated(email: string, firstName?: string): Promise<void> {
  await fire("contact.created", { email, firstName });
}
