import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui";
import { money } from "@/lib/format";

export async function DashboardKpis({ organizationId }: { organizationId: string }) {
  const [orderAgg, openCommission] = await Promise.all([
    prisma.order.aggregate({
      where: { organizationId },
      _sum: { grossCents: true, netProfitCents: true },
      _count: true,
    }),
    prisma.affiliateOrderAttribution.aggregate({
      where: { affiliate: { organizationId } },
      _sum: { commissionCents: true },
    }),
  ]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <StatCard label="Gross revenue" value={money(orderAgg._sum.grossCents ?? 0)} hint="All-time, all brands" />
      <StatCard
        label="Net profit"
        value={money(orderAgg._sum.netProfitCents ?? 0)}
        hint="After COGS, fees, commission"
      />
      <StatCard label="Total orders" value={String(orderAgg._count)} hint="All-time" />
      <StatCard
        label="Affiliate commission owed"
        value={money(openCommission._sum.commissionCents ?? 0)}
        hint="Across attributed orders"
      />
    </div>
  );
}

export function DashboardKpisSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-background-200 bg-background-50 p-4 h-[74px] animate-pulse">
          <div className="h-3 w-20 bg-background-200 rounded mb-3" />
          <div className="h-6 w-24 bg-background-200 rounded" />
        </div>
      ))}
    </div>
  );
}
