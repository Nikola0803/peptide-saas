"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { releaseOrderStock } from "@/lib/stock-release-job";

async function assertOrderOwnership(orderId: string) {
  const { organization } = await requireOrg();
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId: organization.id } });
  if (!order) throw new Error("Order not found");
  return order;
}

export async function addOrderNote(orderId: string, formData: FormData) {
  await assertOrderOwnership(orderId);

  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Note can't be empty");

  await prisma.orderNote.create({ data: { orderId, body } });
  revalidatePath(`/orders/${orderId}`);
}

export async function setFraudFlag(orderId: string, flagged: boolean, formData: FormData) {
  await assertOrderOwnership(orderId);

  const riskReason = String(formData.get("riskReason") ?? "").trim();

  await prisma.order.update({
    where: { id: orderId },
    data: { flaggedRisk: flagged, riskReason: flagged ? riskReason || null : null },
  });
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

export async function addRefund(orderId: string, formData: FormData) {
  await assertOrderOwnership(orderId);

  const type = String(formData.get("type") ?? "REFUND") as "REFUND" | "CHARGEBACK";
  const amountCents = Math.round(Number(formData.get("amount") ?? 0) * 100);
  const reason = String(formData.get("reason") ?? "").trim();

  if (amountCents <= 0) throw new Error("Amount must be greater than zero");

  await prisma.refund.create({
    data: { orderId, type, amountCents, reason: reason || null },
  });
  revalidatePath(`/orders/${orderId}`);
}

export async function updateRefundStatus(orderId: string, refundId: string, status: "PENDING" | "WON" | "LOST" | "COMPLETED") {
  await assertOrderOwnership(orderId);

  await prisma.refund.update({
    where: { id: refundId },
    data: { status, resolvedAt: status === "PENDING" ? null : new Date() },
  });
  revalidatePath(`/orders/${orderId}`);
}

// The thing that was actually missing before any of this: a way to move
// an order out of ON_HOLD at all. Confirming payment does NOT re-reserve
// stock if it was already auto-released for sitting unpaid too long
// (stockReleasedAt set) -- that stock may already be sold to someone
// else by then; the note flags it so staff notice and can act (restock,
// contact the customer, etc.) rather than silently overselling.
export async function confirmPayment(orderId: string) {
  const order = await assertOrderOwnership(orderId);

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "PROCESSING", paymentConfirmedAt: new Date() },
  });

  if (order.stockReleasedAt) {
    await prisma.orderNote.create({
      data: {
        orderId,
        body: "Payment confirmed after stock was already auto-released — check availability before shipping, it may need to be re-reserved manually.",
      },
    });
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

export async function markCompleted(orderId: string) {
  await assertOrderOwnership(orderId);
  await prisma.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

// Manual version of what the 24h job does automatically -- for staff to
// cancel a storefront order and free its reserved stock right away
// instead of waiting out the window.
export async function cancelAndReleaseStock(orderId: string) {
  const order = await assertOrderOwnership(orderId);
  if (order.status !== "ON_HOLD") throw new Error("Only an ON_HOLD order can be cancelled this way");

  const released = await releaseOrderStock(orderId);
  await prisma.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
  if (!released) {
    await prisma.orderNote.create({ data: { orderId, body: "Order cancelled by staff (stock had already been released)." } });
  } else {
    await prisma.orderNote.create({ data: { orderId, body: "Order cancelled by staff — stock released back to available." } });
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}
