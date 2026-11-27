// Keeps Omnisend's copy of every EVLV storefront order current, so the
// Omnisend flows that key off order state actually start:
//   - "order fulfilled"  -> Review & Referral
//   - cancelled/refunded -> exits Post-purchase / Review
// runCheckout() only reports an order once, at checkout (awaiting payment,
// unfulfilled). This job re-reports an order whenever its payment or
// fulfillment state changes, and on its first run also backfills recent
// orders that never made it (every push before the variantID fix was
// rejected). Same single-process interval pattern as stock-release-job.ts.
import { prisma } from "@/lib/prisma";
import { omnisendConfigured, pushCustomEventToOmnisend, pushOrderToOmnisend, type OmnisendOrderInput } from "@/lib/omnisend";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
// Orders placed before this are never backfilled -- a first "placed order"
// for them would start Post-purchase emails about an old purchase.
const BACKFILL_DAYS = Number(process.env.OMNISEND_BACKFILL_DAYS ?? 14);

type PaymentStatus = OmnisendOrderInput["paymentStatus"];
type FulfillmentStatus = OmnisendOrderInput["fulfillmentStatus"];

// The Omnisend account is EVLV's -- other brands' customers must never land in it.
function isEvlvBrand(brand: { slug: string; domain: string } | null | undefined): boolean {
  if (!brand) return false;
  return brand.slug.toLowerCase() === "evlv" || brand.domain.toLowerCase().replace(/^www\./, "") === "evlvpeptides.com";
}

export async function isEvlvBrandId(brandId: string): Promise<boolean> {
  return isEvlvBrand(await prisma.brand.findUnique({ where: { id: brandId }, select: { slug: true, domain: true } }));
}

function omnisendState(order: { status: string; shippedAt: Date | null }): { paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus } {
  const fulfillmentStatus: FulfillmentStatus = order.shippedAt ? "fulfilled" : "unfulfilled";
  switch (order.status) {
    case "ON_HOLD":
      return { paymentStatus: "awaitingPayment", fulfillmentStatus };
    // REFUNDED is also how staff cancel an unshipped order (see
    // cancelAndReleaseStock in orders/actions.ts): unshipped -> voided.
    case "REFUNDED":
      return { paymentStatus: order.shippedAt ? "refunded" : "voided", fulfillmentStatus };
    default:
      return { paymentStatus: "paid", fulfillmentStatus };
  }
}

function trackingUrl(carrier: string | null, tracking: string | null): string {
  if (!tracking) return "";
  const t = encodeURIComponent(tracking);
  const c = (carrier ?? "").toLowerCase();
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${t}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
  if (c.includes("dhl")) return `https://www.dhl.com/en/express/tracking.html?AWB=${t}`;
  // USPS is the default carrier for EVLV's US shipments.
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
}

export async function syncOrdersToOmnisend(): Promise<void> {
  if (!omnisendConfigured()) return;
  const since = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: { placedAt: { gte: since } },
    include: { items: true, contact: true, brand: { select: { id: true, slug: true, domain: true } } },
    orderBy: { placedAt: "asc" },
    take: 200,
  });

  for (const order of orders) {
    if (!isEvlvBrand(order.brand) || !order.contact?.email) continue;
    const { paymentStatus, fulfillmentStatus } = omnisendState(order);
    const state = `${paymentStatus}|${fulfillmentStatus}`;
    if (order.omnisendSyncedState === state) continue;

    // Omnisend's catalog is keyed by storefront slug -- same IDs runCheckout sends.
    const productIds = order.items.map((i) => i.productId).filter((id): id is string => Boolean(id));
    const mappings = productIds.length
      ? await prisma.storeMapping.findMany({ where: { brandId: order.brandId, productId: { in: productIds } }, select: { productId: true, slug: true } })
      : [];
    const slugFor = (productId: string | null, sku: string) => mappings.find((m) => m.productId === productId)?.slug || sku;

    const ok = await pushOrderToOmnisend({
      orderID: order.externalOrderNumber,
      email: order.contact.email,
      createdAt: order.placedAt.toISOString(),
      updatedAt: new Date().toISOString(),
      currency: "USD",
      orderSum: order.grossCents + order.shippingCents,
      subTotalSum: order.grossCents,
      shippingSum: order.shippingCents,
      discountSum: order.discountCents || undefined,
      discountCode: order.appliedCouponCodes ?? undefined,
      paymentMethod: order.paymentMethod ?? undefined,
      paymentStatus,
      fulfillmentStatus,
      trackingCode: order.trackingNumber ?? undefined,
      courierTitle: order.carrierCode ?? undefined,
      products: order.items.map((item) => {
        const id = slugFor(item.productId, item.sku);
        return { productID: id, variantID: id, sku: item.sku, title: item.name, quantity: item.quantity, price: Math.round(item.unitPriceCents) };
      }),
    });
    if (ok) {
      // First time Omnisend hears this order shipped: send the tracking
      // details as their own event for the Shipping Confirmation flow
      // (event merge tags are simpler to template than order fields).
      const wasFulfilled = order.omnisendSyncedState?.endsWith("|fulfilled") ?? false;
      if (fulfillmentStatus === "fulfilled" && !wasFulfilled && paymentStatus === "paid") {
        await pushCustomEventToOmnisend({
          eventName: "order-shipped",
          email: order.contact.email,
          properties: {
            orderNumber: order.externalOrderNumber,
            trackingNumber: order.trackingNumber ?? "",
            carrier: order.carrierCode ?? "",
            trackingURL: trackingUrl(order.carrierCode, order.trackingNumber),
          },
        });
      }
      await prisma.order.update({ where: { id: order.id }, data: { omnisendSyncedState: state } });
    }
  }
}

let started = false;

// Called once from instrumentation.ts when the server boots.
export function startOmnisendOrderSyncJob(): void {
  if (started) return;
  started = true;
  syncOrdersToOmnisend().catch((err) => console.error("[omnisend-sync] initial run failed", err));
  setInterval(() => {
    syncOrdersToOmnisend().catch((err) => console.error("[omnisend-sync] tick failed", err));
  }, CHECK_INTERVAL_MS);
}
