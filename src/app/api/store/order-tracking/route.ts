import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";

const bodySchema = z.object({
  orderId: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
});

// Public storefront lookup. Both values printed/sent to the customer are
// required, and a miss always returns the same response so the endpoint does
// not disclose whether an order number or an email exists independently.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid order ID and billing email." }, { status: 400 });
  }

  const orderId = parsed.data.orderId.replace(/^#/, "").trim();
  const email = parsed.data.email.toLowerCase();
  const orderSeq = /^\d+$/.test(orderId) ? Number(orderId) : undefined;

  const order = await prisma.order.findFirst({
    where: {
      brandId: store.brandId,
      OR: [
        { externalOrderNumber: orderId },
        ...(orderSeq ? [{ orderSeq }] : []),
      ],
      contact: { email: { equals: email, mode: "insensitive" } },
    },
    select: {
      externalOrderNumber: true,
      orderSeq: true,
      status: true,
      placedAt: true,
      carrierCode: true,
      trackingNumber: true,
      shippedAt: true,
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: "We couldn't match that order ID and billing email." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    orderNumber: order.externalOrderNumber,
    shortOrderNumber: String(order.orderSeq),
    status: order.status,
    placedAt: order.placedAt,
    carrierCode: order.carrierCode,
    trackingNumber: order.trackingNumber,
    shippedAt: order.shippedAt,
  });
}
