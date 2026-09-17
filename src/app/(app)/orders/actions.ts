"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { releaseOrderStock } from "@/lib/stock-release-job";
import { sendPaymentConfirmedEmail } from "@/lib/automation-job";

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

  sendPaymentConfirmedEmail(order.organizationId, orderId).catch((err) => console.error("Payment confirmed email failed", err));

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

// Manual version of what the 24h job does automatically for an ON_HOLD
// order -- for staff to cancel a storefront order and free its reserved
// stock right away instead of waiting out the window. Also the only way
// to cancel a PROCESSING (paid, not yet shipped) order at all: before
// this, a paid order could only be marked completed or permanently
// deleted -- there was no way to cancel one and have that cancellation
// actually reach anyone. This is also what the ShipStation export feed
// (see /api/shipstation route) keys off of: a REFUNDED order with no
// shippedAt goes out as "cancelled" on VVG's next poll, so cancelling
// here is also how you tell a fulfillment partner to stand down.
// COMPLETED (already shipped) isn't handled here -- that's a return, use
// the Refund workflow on the order instead, not a cancellation.
export async function cancelAndReleaseStock(orderId: string) {
  const order = await assertOrderOwnership(orderId);
  if (order.status !== "ON_HOLD" && order.status !== "PROCESSING") {
    throw new Error("Only an ON_HOLD or PROCESSING order can be cancelled this way");
  }

  const wasPaid = order.status === "PROCESSING";
  const released = await releaseOrderStock(orderId);
  await prisma.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
  if (!released) {
    await prisma.orderNote.create({ data: { orderId, body: "Order cancelled by staff (stock had already been released)." } });
  } else if (wasPaid) {
    await prisma.orderNote.create({
      data: {
        orderId,
        body: "Order cancelled by staff — payment had already been confirmed; issue a refund separately if money needs to go back to the customer. Stock released back to available.",
      },
    });
  } else {
    await prisma.orderNote.create({ data: { orderId, body: "Order cancelled by staff — stock released back to available." } });
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

// Permanent delete -- distinct from cancelAndReleaseStock above, which
// just marks an order REFUNDED and frees its stock but keeps the record.
// This actually removes the Order row (and, since OrderItem/OrderNote/
// Refund/AffiliateOrderAttribution all cascade at the DB level, its
// line items, notes, refund history, and affiliate commission row too).
// Meant for cleaning up test/duplicate/junk orders, not as a normal part
// of order lifecycle -- there is no undo.
export async function deleteOrder(orderId: string) {
  const order = await assertOrderOwnership(orderId);

  // Free any stock this order reserved at checkout before the row (and
  // its items) disappear -- releaseOrderStock is a safe no-op if it was
  // already released, or this was never a storefront stock reservation.
  if (order.status === "ON_HOLD" || order.status === "PROCESSING") {
    await releaseOrderStock(orderId).catch((err) => console.error("Stock release before delete failed", err));
  }

  await prisma.$transaction(async (tx) => {
    // A coupon's redemptionCount should reflect real, still-existing
    // orders -- deleting one that used a coupon shouldn't leave that
    // coupon looking permanently more "used up" than it really is.
    if (order.couponId) {
      const coupon = await tx.coupon.findUnique({ where: { id: order.couponId } });
      if (coupon && coupon.redemptionCount > 0) {
        await tx.coupon.update({ where: { id: order.couponId }, data: { redemptionCount: coupon.redemptionCount - 1 } });
      }
    }

    // Invoice.orderId has no cascade rule (an invoice is its own record,
    // not order-owned) -- detach it instead of letting the delete fail on
    // a foreign key constraint.
    await tx.invoice.updateMany({ where: { orderId }, data: { orderId: null } });

    await tx.order.delete({ where: { id: orderId } });
  });

  revalidatePath("/orders");
  revalidatePath("/contacts");
}
