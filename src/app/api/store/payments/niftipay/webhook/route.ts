import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";

const bodySchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().startsWith("payment."),
  created_at: z.string().optional(),
  webhookId: z.string().optional(),
  receivedAt: z.string().optional(),
  data: z.object({
    rail: z.string().optional(),
    order_id: z.union([z.string(), z.number()]).optional(),
    order_key: z.union([z.string(), z.number()]).optional(),
    merchant_reference: z.string().min(1),
    status: z.string().optional(),
    currency: z.string().optional(),
    total_cents: z.number().int().nonnegative().optional(),
  }).passthrough(),
}).passthrough();

export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Niftipay event" }, { status: 400 });

  const event = parsed.data;
  const rawReference = event.data.merchant_reference;
  const orderNumber = rawReference.startsWith("EVLV-AU-") ? rawReference.slice("EVLV-AU-".length) : rawReference;
  const order = await prisma.order.findFirst({ where: { organizationId: store.organizationId, brandId: store.brandId, externalOrderNumber: orderNumber }, select: { id: true, status: true } });
  if (!order) return NextResponse.json({ error: "Order reference not found" }, { status: 404 });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { organizationId: store.organizationId, brandId: store.brandId, topic: event.event_type, providerEventId: event.event_id, payload: event as Prisma.InputJsonValue, signatureValid: true, processedAt: new Date() } });
      const note = `Niftipay ${event.event_type} · ${rawReference}${event.data.order_key ? ` · order ${event.data.order_key}` : ""}`;
      if (event.event_type === "payment.confirmed" && order.status === "ON_HOLD") {
        await tx.order.update({ where: { id: order.id }, data: { status: "PROCESSING", paymentConfirmedAt: new Date(), notes: { create: { body: note } } } });
      } else if (event.event_type === "payment.refunded") {
        await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED", notes: { create: { body: note } } } });
      } else if (event.event_type === "payment.chargeback") {
        await tx.order.update({ where: { id: order.id }, data: { status: "ON_HOLD", flaggedRisk: true, riskReason: "Niftipay card chargeback", notes: { create: { body: note } } } });
      } else {
        await tx.orderNote.create({ data: { orderId: order.id, body: note } });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ ok: true, duplicate: true });
    console.error("Niftipay CRM webhook failed", error);
    return NextResponse.json({ error: "Could not process payment event" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
