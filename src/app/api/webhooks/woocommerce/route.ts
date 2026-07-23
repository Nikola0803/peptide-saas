import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignature } from "@/lib/signature";
import { OrderStatus } from "@prisma/client";
import { pushOrderToShipStation } from "@/lib/shipstation";

// Flat-rate assumption for a card processor fee, used until each
// organization can configure its own merchant fee schedule per brand.
const MERCHANT_FEE_PERCENT = 2.9;
const MERCHANT_FEE_FIXED_CENTS = 30;

function mapStatus(wooStatus: string): OrderStatus {
  switch (wooStatus) {
    case "completed":
      return "COMPLETED";
    case "on-hold":
      return "ON_HOLD";
    case "refunded":
    case "cancelled":
      return "REFUNDED";
    case "processing":
    default:
      return "PROCESSING";
  }
}

function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

// POST /api/webhooks/woocommerce?store=<brandId>
// Every brand's WooCommerce site posts order.created / order.updated here
// (see the /webhooks page for the exact per-brand setup steps). This
// upserts the contact, computes COGS + merchant fee + affiliate commission
// + net profit, and decrements master stock — all in one transaction, so a
// half-applied order can never leave stock or profit numbers inconsistent.
export async function POST(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("store");
  const rawBody = await req.text();
  const signature = req.headers.get("x-wc-webhook-signature");

  if (!storeId) {
    return NextResponse.json({ error: "Missing ?store=" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({ where: { id: storeId } });
  if (!brand) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  }

  const signatureValid = verifySignature(rawBody, brand.webhookSecret, signature);

  if (!signatureValid) {
    await prisma.webhookEvent.create({
      data: {
        organizationId: brand.organizationId,
        brandId: brand.id,
        topic: req.headers.get("x-wc-webhook-topic") ?? "order.created",
        payload: safeJson(rawBody),
        signatureValid: false,
        error: "Signature verification failed",
      },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // WooCommerce sends a ping payload (just { webhook_id }) when a webhook is
  // first created or manually tested — nothing to process, just acknowledge.
  if (!payload?.id && !payload?.number) {
    await prisma.webhookEvent.create({
      data: {
        organizationId: brand.organizationId,
        brandId: brand.id,
        topic: req.headers.get("x-wc-webhook-topic") ?? "ping",
        payload,
        signatureValid: true,
        processedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, ping: true });
  }

  try {
    const orderId = await processOrder(brand.id, brand.organizationId, payload);
    await prisma.webhookEvent.create({
      data: {
        organizationId: brand.organizationId,
        brandId: brand.id,
        topic: req.headers.get("x-wc-webhook-topic") ?? "order.created",
        payload,
        signatureValid: true,
        processedAt: new Date(),
      },
    });
    await prisma.brand.update({ where: { id: brand.id }, data: { lastSyncedAt: new Date() } });
    autoPushToShipStation(brand.organizationId, orderId).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await prisma.webhookEvent.create({
      data: {
        organizationId: brand.organizationId,
        brandId: brand.id,
        topic: req.headers.get("x-wc-webhook-topic") ?? "order.created",
        payload,
        signatureValid: true,
        error: err?.message ?? "Unknown error",
      },
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

function safeJson(rawBody: string) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody };
  }
}

/**
 * If the organization has ShipStation connected with auto-push on, push
 * this order over as soon as it lands — same call the manual "Push"
 * button on the Shipping page makes, just triggered automatically instead
 * of waiting for the operator to click it.
 */
async function autoPushToShipStation(organizationId: string, orderId: string) {
  const config = await prisma.shipStationConfig.findUnique({ where: { organizationId } });
  if (!config || !config.autoPush) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, contact: true, brand: true },
  });
  if (!order || order.shipstationOrderId) return;
  if (order.status !== "COMPLETED" && order.status !== "PROCESSING") return;

  const result = await pushOrderToShipStation(config.apiKey, config.apiSecret, {
    orderNumber: `${order.brand.slug}-${order.externalOrderNumber}`,
    orderDate: order.placedAt.toISOString(),
    orderStatus: "awaiting_shipment",
    billToEmail: order.contact?.email,
    shipTo: {
      name: order.shipToName ?? undefined,
      street1: order.shipToAddress1 ?? undefined,
      street2: order.shipToAddress2 ?? undefined,
      city: order.shipToCity ?? undefined,
      state: order.shipToState ?? undefined,
      postalCode: order.shipToPostalCode ?? undefined,
      country: order.shipToCountry ?? undefined,
    },
    amountPaid: order.grossCents / 100,
    items: order.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPriceCents / 100,
    })),
  });

  await prisma.order.update({ where: { id: order.id }, data: { shipstationOrderId: String(result.orderId) } });
}

async function processOrder(brandId: string, organizationId: string, payload: any): Promise<string> {
  const email: string | undefined = payload?.billing?.email?.toLowerCase();
  const externalOrderNumber = String(payload?.number ?? payload?.id);
  const grossCents = toCents(payload?.total ?? 0);
  const couponCode: string | undefined = payload?.coupon_lines?.[0]?.code;
  const lineItems: any[] = payload?.line_items ?? [];

  return prisma.$transaction(async (tx) => {
    // 1. Resolve / create the unified contact + its per-brand identity link.
    let contactId: string | undefined;
    if (email) {
      const contact = await tx.contact.upsert({
        where: { organizationId_email: { organizationId, email } },
        update: {},
        create: { organizationId, email },
      });
      contactId = contact.id;

      await tx.contactBrandLink.upsert({
        where: { contactId_brandId: { contactId: contact.id, brandId } },
        update: { externalCustomerId: String(payload?.customer_id ?? "") || undefined },
        create: {
          contactId: contact.id,
          brandId,
          externalCustomerId: String(payload?.customer_id ?? "") || undefined,
        },
      });
    }

    // 2. Match line items against the master catalog, decrement stock,
    //    allocate against the oldest active batch (FIFO — this is what
    //    makes a recall list possible later), and total up COGS.
    let cogsCentsTotal = 0;
    const resolvedItems: {
      productId?: string;
      sku: string;
      name: string;
      quantity: number;
      unitPriceCents: number;
      lotId?: string;
    }[] = [];

    for (const item of lineItems) {
      const sku: string | undefined = item.sku;
      const quantity: number = item.quantity ?? 1;
      const unitPriceCents = toCents(Number(item.total ?? 0) / Math.max(quantity, 1));

      let productId: string | undefined;
      let lotId: string | undefined;
      if (sku) {
        const product = await tx.product.findUnique({
          where: { organizationId_sku: { organizationId, sku } },
        });
        if (product) {
          productId = product.id;
          cogsCentsTotal += product.cogsCents * quantity;
          await tx.product.update({
            where: { id: product.id },
            data: { masterStock: { decrement: quantity } },
          });

          // FIFO batch allocation: oldest active lot with stock left gets
          // used first. Products with no lots recorded just skip this —
          // lot tracking is opt-in, not required for the order to process.
          const lot = await tx.productLot.findFirst({
            where: { productId: product.id, status: "ACTIVE", quantityRemaining: { gt: 0 } },
            orderBy: { receivedAt: "asc" },
          });
          if (lot) {
            lotId = lot.id;
            const remaining = lot.quantityRemaining - quantity;
            await tx.productLot.update({
              where: { id: lot.id },
              data: {
                quantityRemaining: Math.max(remaining, 0),
                status: remaining <= 0 ? "DEPLETED" : "ACTIVE",
              },
            });
          }
        }
      }

      resolvedItems.push({ productId, lotId, sku: sku ?? "unknown", name: item.name ?? sku ?? "Item", quantity, unitPriceCents });
    }

    // 3. Affiliate attribution, if the order used a tracked coupon code.
    let affiliateId: string | undefined;
    let commissionCents = 0;
    if (couponCode) {
      const affiliate = await tx.affiliate.findFirst({
        where: { organizationId, couponCode: { equals: couponCode, mode: "insensitive" } },
      });
      if (affiliate) {
        affiliateId = affiliate.id;
        commissionCents = Math.round((grossCents * affiliate.ratePercent) / 100);
      }
    }

    const merchantFeeCents = Math.round((grossCents * MERCHANT_FEE_PERCENT) / 100) + MERCHANT_FEE_FIXED_CENTS;
    const netProfitCents = grossCents - cogsCentsTotal - merchantFeeCents - commissionCents;

    const shipping = payload?.shipping ?? {};
    const shipToName = [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") || undefined;

    // 4. Upsert the order itself and its line items.
    const order = await tx.order.upsert({
      where: { brandId_externalOrderNumber: { brandId, externalOrderNumber } },
      update: {
        status: mapStatus(payload?.status),
        couponCode,
        grossCents,
        netProfitCents,
        contactId,
        shipToName,
        shipToAddress1: shipping.address_1 || undefined,
        shipToAddress2: shipping.address_2 || undefined,
        shipToCity: shipping.city || undefined,
        shipToState: shipping.state || undefined,
        shipToPostalCode: shipping.postcode || undefined,
        shipToCountry: shipping.country || undefined,
      },
      create: {
        organizationId,
        brandId,
        contactId,
        externalOrderNumber,
        status: mapStatus(payload?.status),
        couponCode,
        grossCents,
        netProfitCents,
        placedAt: payload?.date_created ? new Date(payload.date_created) : new Date(),
        shipToName,
        shipToAddress1: shipping.address_1 || undefined,
        shipToAddress2: shipping.address_2 || undefined,
        shipToCity: shipping.city || undefined,
        shipToState: shipping.state || undefined,
        shipToPostalCode: shipping.postcode || undefined,
        shipToCountry: shipping.country || undefined,
      },
    });

    // Line items are append-only on first insert; re-deliveries of the
    // same order (status updates) don't currently re-diff items — that's
    // a fine simplification for a skeleton but worth revisiting before
    // relying on it for partial refunds / edited orders.
    const existingItemCount = await tx.orderItem.count({ where: { orderId: order.id } });
    if (existingItemCount === 0) {
      await tx.orderItem.createMany({
        data: resolvedItems.map((i) => ({ ...i, orderId: order.id })),
      });
    }

    if (affiliateId) {
      await tx.affiliateOrderAttribution.upsert({
        where: { orderId: order.id },
        update: { commissionCents, affiliateId },
        create: { orderId: order.id, affiliateId, commissionCents },
      });
    }

    return order.id;
  });
}
