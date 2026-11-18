import { prisma } from "@/lib/prisma";
import { money } from "@/lib/format";
import { computeProductProfit } from "@/lib/order-profit";

// Earnings from paid orders (completed + processing), worked out live from
// each item's current product cost, so it always uses the latest costs.
// Same rules as checkout: 5% P2P discount, card fee on card payments only,
// affiliate commission as recorded on the order.

type Totals = { orders: number; revenue: number; cogs: number; fees: number; commission: number; net: number };

const empty = (): Totals => ({ orders: 0, revenue: 0, cogs: 0, fees: 0, commission: 0, net: 0 });

export async function DashboardEarnings({ organizationId, brandId }: { organizationId: string; brandId?: string }) {
  const orders = await prisma.order.findMany({
    where: { organizationId, ...(brandId ? { brandId } : {}), status: { in: ["COMPLETED", "PROCESSING"] } },
    select: {
      placedAt: true,
      grossCents: true,
      paymentMethod: true,
      items: { select: { quantity: true, product: { select: { cogsCents: true } } } },
      attribution: { select: { commissionCents: true } },
    },
  });

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const allTime = empty();
  const lastWeek = empty();
  for (const order of orders) {
    const cogsCents = order.items.reduce((sum, item) => sum + (item.product?.cogsCents ?? 0) * item.quantity, 0);
    const r = computeProductProfit({
      grossCents: order.grossCents,
      paymentMethod: order.paymentMethod,
      cogsCents,
      commissionCents: order.attribution?.commissionCents ?? 0,
    });
    const targets = order.placedAt.getTime() >= weekAgo ? [allTime, lastWeek] : [allTime];
    for (const t of targets) {
      t.orders += 1;
      t.revenue += r.productsPaidCents;
      t.cogs += r.cogsCents;
      t.fees += r.feeCents;
      t.commission += r.commissionCents;
      t.net += r.netProfitCents;
    }
  }

  const rows: { label: string; key: keyof Totals; negative?: boolean }[] = [
    { label: "Products revenue", key: "revenue" },
    { label: "Product cost", key: "cogs", negative: true },
    { label: "Card fees", key: "fees", negative: true },
    { label: "Affiliate commission", key: "commission", negative: true },
  ];

  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-4 mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground-950">Earnings</h2>
        <span className="text-xs text-foreground-500">Paid orders, current product costs</span>
      </div>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-foreground-500">
            <th className="text-left font-medium pb-2"></th>
            <th className="text-right font-medium pb-2">Last 7 days</th>
            <th className="text-right font-medium pb-2">All time</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1 text-foreground-600">Paid orders</td>
            <td className="py-1 text-right">{lastWeek.orders}</td>
            <td className="py-1 text-right">{allTime.orders}</td>
          </tr>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-1 text-foreground-600">{row.label}</td>
              <td className="py-1 text-right">{row.negative ? "-" : ""}{money(lastWeek[row.key])}</td>
              <td className="py-1 text-right">{row.negative ? "-" : ""}{money(allTime[row.key])}</td>
            </tr>
          ))}
          <tr className="border-t border-background-200 font-semibold text-foreground-950">
            <td className="pt-2">Net profit</td>
            <td className="pt-2 text-right">{money(lastWeek.net)}</td>
            <td className="pt-2 text-right">{money(allTime.net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function DashboardEarningsSkeleton() {
  return <div className="rounded-lg border border-background-200 bg-background-50 p-4 mb-6 h-[230px] animate-pulse" />;
}
