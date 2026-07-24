"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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
