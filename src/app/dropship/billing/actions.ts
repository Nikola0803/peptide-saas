"use server";

import { revalidatePath } from "next/cache";
import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// "He sends us auto billing" -- this is that: sums every shipped item this
// supplier hasn't been invoiced for yet, at the cost+shipping rates he set
// himself on his own products, into one SupplierInvoice. Nothing here
// changes what's owed after the fact (rate changes only apply to items
// shipped after the change) since each SupplierInvoiceLineItem freezes the
// cost/shipping at generation time.
export async function generateSupplierInvoice() {
  const { supplier } = await requireSupplier();

  const unbilledItems = await prisma.orderItem.findMany({
    where: { supplierId: supplier.id, fulfillmentStatus: "SHIPPED", invoiceLineItem: null },
  });

  if (unbilledItems.length === 0) {
    throw new Error("Nothing to bill — every shipped item is already invoiced");
  }

  // Billed at whatever rate is on the supplier's product list *right now*
  // (there's no per-order rate history) -- if you change your price after
  // shipping something but before invoicing it, the new rate applies.
  const supplierProducts = await prisma.supplierProduct.findMany({ where: { supplierId: supplier.id } });
  const rateByProductId = new Map(supplierProducts.map((sp) => [sp.productId, sp]));

  const shippedDates = unbilledItems.map((i) => i.shippedAt!.getTime());
  const periodStart = new Date(Math.min(...shippedDates));
  const periodEnd = new Date();

  let totalCents = 0;
  const lineItemsData = unbilledItems.map((item) => {
    const rate = item.productId ? rateByProductId.get(item.productId) : undefined;
    const costCents = (rate?.costCents ?? 0) * item.quantity;
    const shippingCents = rate?.shippingCents ?? 0;
    totalCents += costCents + shippingCents;
    return { orderItemId: item.id, costCents, shippingCents };
  });

  await prisma.supplierInvoice.create({
    data: {
      supplierId: supplier.id,
      periodStart,
      periodEnd,
      totalCents,
      lineItems: { createMany: { data: lineItemsData } },
    },
  });

  revalidatePath("/dropship/billing");
}
