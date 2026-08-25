import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyCustomerToken } from "@/lib/customer-auth";

// GET /api/store/account/orders — requires the bearer token from
// /api/store/auth/login or /register. Returns this brand's order history
// for that customer only (never another brand's, even same email/org).
export async function GET(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const claims = verifyCustomerToken(bearerToken(req));
  if (!claims || claims.organizationId !== store.organizationId || claims.brandId !== store.brandId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { brandId: store.brandId, contactId: claims.contactId },
    orderBy: { placedAt: "desc" },
    include: { items: true },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.externalOrderNumber,
      status: o.status,
      grossCents: o.grossCents,
      paymentMemo: o.paymentMemo,
      placedAt: o.placedAt,
      trackingNumber: o.trackingNumber,
      carrierCode: o.carrierCode,
      shippedAt: o.shippedAt,
      items: o.items.map((i) => ({ sku: i.sku, name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
    })),
  });
}
