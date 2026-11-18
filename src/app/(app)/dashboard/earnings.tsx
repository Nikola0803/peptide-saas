import { prisma } from "@/lib/prisma";
import { money } from "@/lib/format";
import { computeProductProfit } from "@/lib/order-profit";

// Earnings from paid orders (completed + processing). Net profit is the sum
// of each order's saved "Net profit" -- the same number the Orders list
// shows. Revenue, card fees and commission use the same rule as checkout
// (src/lib/order-profit.ts); product cost is what is left, so the rows
// always add up to the saved net profit.

type Totals = { orders: number; revenue: number; cogs: number; fees: number; commission: number; net: number };

const empty = (): Totals => ({ orders: 0, revenue: 0, cogs: 0, fees: 0, commission: 0, net: 0 });

export async function DashboardEarnings({ organizationId, brandId }: { organizationId: string; brandId?: string }) {
  const orders = await prisma.order.findMany({
    where: { organizationId, ...(brandId ? { brandId } : {}), status: { in: ["COMPLETED", "PROCESSING"] } },
    select: {
      placedAt: true,
      grossCents: true,
      paymentMethod: true,
      netProfitCents: true,
      attribution: { select: { commissionCents: true } },
    },
  });

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const allTime = empty();
  const lastWeek = empty();
  for (const order of orders) {
    const r = computeProductProfit({
      grossCents: order.grossCents,
      paymentMethod: order.paymentMethod,
      cogsCents: 0,
      commissionCents: order.attribution?.commissionCents ?? 0,
    });
    const net = order.netProfitCents ?? 0;
    const cogs = r.productsPaidCents - r.feeCents - r.commissionCents - net;
    const targets = order.placedAt.getTime() >= weekAgo ? [allTime, lastWeek] : [allTime];
    for (const t of targets) {
      t.orders += 1;
      t.revenue += r.productsPaidCents;
      t.cogs += cogs;
      t.fees += r.feeCents;
      t.commission += r.commissionCents;
      t.net += net;
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
        <span className="text-xs text-foreground-500">Paid orders · net profit matches the Orders list</span>
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
