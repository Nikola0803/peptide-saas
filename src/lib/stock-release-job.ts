import { prisma } from "@/lib/prisma";

// "Stock locked until payment confirmed" for pay-by-memo storefront
// checkouts: masterStock/SupplierProduct.stock is decremented at checkout
// exactly like a real sale (see runCheckout in order-engine.ts), but an
// order nobody ever pays for shouldn't hold that stock forever. After this
// many hours with no manual payment confirmation, an ON_HOLD storefront
// order's stock goes back to available automatically.
export const RELEASE_WINDOW_HOURS = 24;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Only ever touches orders this app itself created via checkout
// (externalOrderNumber prefixed "STORE-" — see runCheckout). WooCommerce's
// own ON_HOLD orders are a live e-commerce state Woo manages on its own
// end; auto-releasing those would be wrong, they were never a stock
// reservation this app made.
export async function releaseOrderStock(orderId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.stockReleasedAt) return false;

    for (const item of order.items) {
      if (!item.productId) continue;

      // Mirrors exactly which pool runCheckout decremented (order-engine.ts)
      // — a dropshipped item only ever touched the supplier's stock, never
      // Product.masterStock, so only that pool gets restored.
      if (item.supplierId) {
        const sp = await tx.supplierProduct.findFirst({ where: { supplierId: item.supplierId, productId: item.productId } });
        if (sp) await tx.supplierProduct.update({ where: { id: sp.id }, data: { stock: { increment: item.quantity } } });
      } else {
        await tx.product.update({ where: { id: item.productId }, data: { masterStock: { increment: item.quantity } } });
      }
    }

    await tx.order.update({ where: { id: orderId }, data: { stockReleasedAt: new Date() } });
    await tx.orderNote.create({ data: { orderId, body: "Stock released automatically — unpaid after 24h." } });
    return true;
  });
}

async function releaseExpiredStock(): Promise<void> {
  const cutoff = new Date(Date.now() - RELEASE_WINDOW_HOURS * 60 * 60 * 1000);
  const expired = await prisma.order.findMany({
    where: {
      status: "ON_HOLD",
      stockReleasedAt: null,
      placedAt: { lte: cutoff },
      externalOrderNumber: { startsWith: "STORE-" },
    },
    select: { id: true },
  });

  for (const order of expired) {
    await releaseOrderStock(order.id).catch((err) => console.error(`Stock release failed for order ${order.id}`, err));
  }
}

let started = false;

// Called once from instrumentation.ts when the server process boots. No
// separate cron/queue infrastructure — this app runs as a single
// long-lived pm2 process, so a plain interval is enough; guarded by
// `started` since Next can import this module more than once per process.
export function startStockReleaseJob(): void {
  if (started) return;
  started = true;
  releaseExpiredStock().catch((err) => console.error("Initial stock release check failed", err));
  setInterval(() => {
    releaseExpiredStock().catch((err) => console.error("Stock release check failed", err));
  }, CHECK_INTERVAL_MS);
}
