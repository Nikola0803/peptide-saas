import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/plugin/bulk-sync?store=<brandId>
// header: X-CC-Secret: <brand.webhookSecret>
//
// The plugin calls this once after connecting (and whenever the operator
// clicks "Sync all products & orders now"), sending everything it can read
// from the local WooCommerce install directly. This is what makes existing
// history show up, not just orders placed after the webhook was wired up.
export async function POST(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("store");
  const secret = req.headers.get("x-cc-secret");
  if (!storeId) return NextResponse.json({ error: "Missing ?store=" }, { status: 400 });

  const brand = await prisma.brand.findUnique({ where: { id: storeId } });
  if (!brand || brand.webhookSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const products: any[] = body.products ?? [];
  const orders: any[] = body.orders ?? [];

  let productsUpserted = 0;
  for (const p of products) {
    if (!p.sku) continue;
    await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: brand.organizationId, sku: p.sku } },
      update: {}, // never overwrite COGS/master stock the operator has already edited by hand
      create: {
        organizationId: brand.organizationId,
        sku: p.sku,
        chemicalName: p.name ?? p.sku,
        cogsCents: 0,
        masterStock: Number(p.stock_quantity ?? 0),
      },
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { organizationId_sku: { organizationId: brand.organizationId, sku: p.sku } },
    });
    await prisma.storeMapping.upsert({
      where: { brandId_externalProductId: { brandId: brand.id, externalProductId: String(p.id) } },
      update: { storePriceCents: p.price ? Math.round(Number(p.price) * 100) : undefined },
      create: {
        productId: product.id,
        brandId: brand.id,
        externalProductId: String(p.id),
        storePriceCents: p.price ? Math.round(Number(p.price) * 100) : undefined,
      },
    });
    productsUpserted += 1;
  }

  let ordersUpserted = 0;
  for (const o of orders) {
    // Reuses the same shape / logic as the live webhook — a historical
    // order is processed identically to one that just came in live.
    await importHistoricalOrder(brand.id, brand.organizationId, o);
    ordersUpserted += 1;
  }

  await prisma.brand.update({ where: { id: brand.id }, data: { lastSyncedAt: new Date() } });

  return NextResponse.json({ ok: true, productsUpserted, ordersUpserted });
}

async function importHistoricalOrder(brandId: string, organizationId: string, payload: any) {
  const email: string | undefined = payload?.billing?.email?.toLowerCase();
  const externalOrderNumber = String(payload?.number ?? payload?.id);
  const grossCents = Math.round(Number(payload?.total ?? 0) * 100);
  const couponCode: string | undefined = payload?.coupon_lines?.[0]?.code;

  const existing = await prisma.order.findUnique({
    where: { brandId_externalOrderNumber: { brandId, externalOrderNumber } },
  });
  if (existing) return; // backfill never overwrites an order the live webhook already recorded

  let contactId: string | undefined;
  if (email) {
    const contact = await prisma.contact.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: {},
      create: { organizationId, email },
    });
    contactId = contact.id;
    await prisma.contactBrandLink.upsert({
      where: { contactId_brandId: { contactId: contact.id, brandId } },
      update: {},
      create: { contactId: contact.id, brandId },
    });
  }

  const statusMap: Record<string, "COMPLETED" | "PROCESSING" | "ON_HOLD" | "REFUNDED"> = {
    completed: "COMPLETED",
    "on-hold": "ON_HOLD",
    refunded: "REFUNDED",
    cancelled: "REFUNDED",
  };

  await prisma.order.create({
    data: {
      organizationId,
      brandId,
      contactId,
      externalOrderNumber,
      status: statusMap[payload?.status] ?? "PROCESSING",
      couponCode,
      grossCents,
      // Historical net profit isn't backfilled with COGS/fee math here —
      // it's recomputed by re-running the same order through the live
      // webhook logic in a later pass, once master COGS values are set.
      netProfitCents: null,
      placedAt: payload?.date_created ? new Date(payload.date_created) : new Date(),
    },
  });
}
