import { prisma } from "@/lib/prisma";
import { computeProductProfit } from "@/lib/order-profit";
import { convertCents } from "@/lib/expenses";
import type { StoreCurrency } from "@/lib/store-currency";

// Order-side totals for the Expenses page. Same rule as the dashboard
// Earnings card: paid orders (COMPLETED + PROCESSING), net profit = each
// order's saved netProfitCents (products paid - product cost - card fee -
// affiliate commission). Shipping the customer paid is reported apart.

export type OrderTotals = {
  orders: number;
  revenue: number; // products paid
  cogs: number;
  fees: number;
  commission: number;
  profit: number; // saved order net profit
  shippingCharged: number;
};

export const emptyOrderTotals = (): OrderTotals => ({
  orders: 0,
  revenue: 0,
  cogs: 0,
  fees: 0,
  commission: 0,
  profit: 0,
  shippingCharged: 0,
});

export async function loadPaidOrders(opts: {
  organizationId: string;
  brandIds: string[] | null; // null = every store
  start: Date | null;
  end: Date;
}) {
  return prisma.order.findMany({
    where: {
      organizationId: opts.organizationId,
      ...(opts.brandIds ? { brandId: { in: opts.brandIds } } : {}),
      status: { in: ["COMPLETED", "PROCESSING"] },
      placedAt: { ...(opts.start ? { gte: opts.start } : {}), lt: opts.end },
    },
    select: {
      placedAt: true,
      brandId: true,
      grossCents: true,
      shippingCents: true,
      paymentMethod: true,
      netProfitCents: true,
      attribution: { select: { commissionCents: true } },
    },
  });
}

export type PaidOrderRow = Awaited<ReturnType<typeof loadPaidOrders>>[number];

export function addOrder(
  t: OrderTotals,
  order: PaidOrderRow,
  from: StoreCurrency,
  display: StoreCurrency
) {
  const r = computeProductProfit({
    grossCents: order.grossCents,
    paymentMethod: order.paymentMethod,
    cogsCents: 0,
    commissionCents: order.attribution?.commissionCents ?? 0,
  });
  const net = order.netProfitCents ?? 0;
  const cogs = r.productsPaidCents - r.feeCents - r.commissionCents - net;
  const conv = (c: number) => convertCents(c, from, display);
  t.orders += 1;
  t.revenue += conv(r.productsPaidCents);
  t.cogs += conv(cogs);
  t.fees += conv(r.feeCents);
  t.commission += conv(r.commissionCents);
  t.profit += conv(net);
  t.shippingCharged += conv(order.shippingCents ?? 0);
}
