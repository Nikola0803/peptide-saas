import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyCustomerToken } from "@/lib/customer-auth";

function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

// POST /api/store/account/orders { token } — evlv-site's crm-proxy.ts
// always POSTs with the token in the JSON body (never an Authorization
// header), and expects each order shaped like WooCommerce's REST API
// (number, total as a decimal string, date_created, line_items[].total as
// a decimal string) since src/lib/orders.ts's mapCrmOrders() was written
// against that shape. Still accepts a Bearer header too, for any other
// caller.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const token = bearerToken(req) ?? body?.token;
  const claims = verifyCustomerToken(token);
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
      number: o.externalOrderNumber,
      status: o.status,
      total: centsToDollarString(o.grossCents),
      date_created: o.placedAt.toISOString(),
      line_items: o.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        total: centsToDollarString(i.unitPriceCents * i.quantity),
      })),
    })),
  });
}
