import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";

const legacyBodySchema = z.object({
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

// Current merchant webhook shape documented by Niftipay. Signature checking
// happens at the storefront edge before the payload is forwarded here.
const merchantBodySchema = z.object({
  event: z.enum(["pending", "paid", "cancelled", "expired", "refunded", "chargeback", "risk_alert"]),
  webhookId: z.string().optional(),
  receivedAt: z.string().optional(),
  order: z.object({
    id: z.union([z.string(), z.number()]),
    merchantReference: z.string().min(1),
    status: z.string().optional(),
    currency: z.string().optional(),
    amountCents: z.number().int().nonnegative().optional(),
    orderKey: z.union([z.string(), z.number()]).optional(),
  }).passthrough(),
  nopayn: z.object({
    order_id: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const current = merchantBodySchema.safeParse(body);
  const legacy = legacyBodySchema.safeParse(body);
  if (!current.success && !legacy.success) return NextResponse.json({ error: "Invalid Niftipay event" }, { status: 400 });

  let event: z.infer<typeof merchantBodySchema> | z.infer<typeof legacyBodySchema>;
  let rawReference: string;
  let topic: string;
  let providerEventId: string;
  let orderKey: string | number | undefined;
  if (current.success) {
    event = current.data;
    rawReference = current.data.order.merchantReference;
    topic = current.data.event === "paid" ? "payment.confirmed" : `payment.${current.data.event}`;
    providerEventId = createHash("sha256").update(JSON.stringify(current.data)).digest("hex");
    orderKey = current.data.order.orderKey;
  } else if (legacy.success) {
    event = legacy.data;
    rawReference = legacy.data.data.merchant_reference;
    topic = legacy.data.event_type;
    providerEventId = legacy.data.event_id;
    orderKey = legacy.data.data.order_key;
  } else {
    return NextResponse.json({ error: "Invalid Niftipay event" }, { status: 400 });
  }
  const orderNumber = rawReference.replace(/^EVLV-(?:AU|US)-/, "");
  const order = await prisma.order.findFirst({ where: { organizationId: store.organizationId, brandId: store.brandId, externalOrderNumber: orderNumber }, select: { id: true, status: true } });
  if (!order) return NextResponse.json({ error: "Order reference not found" }, { status: 404 });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { organizationId: store.organizationId, brandId: store.brandId, topic, providerEventId, payload: event as Prisma.InputJsonValue, signatureValid: true, processedAt: new Date() } });
      const note = `Niftipay ${topic} · ${rawReference}${orderKey ? ` · order ${orderKey}` : ""}`;
      if (topic === "payment.confirmed" && order.status === "ON_HOLD") {
        await tx.order.update({ where: { id: order.id }, data: { status: "PROCESSING", paymentConfirmedAt: new Date(), notes: { create: { body: note } } } });
      } else if (topic === "payment.refunded") {
        await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED", notes: { create: { body: note } } } });
      } else if (topic === "payment.chargeback") {
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
