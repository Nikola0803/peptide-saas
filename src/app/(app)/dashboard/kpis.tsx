import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui";
import { money } from "@/lib/format";
import { brandCurrency, toUsdCents } from "@/lib/store-currency";

export async function DashboardKpis({ organizationId, brandId }: { organizationId: string; brandId?: string }) {
  const [byBrand, brands, openCommission] = await Promise.all([
    prisma.order.groupBy({
      by: ["brandId"],
      where: { organizationId, ...(brandId ? { brandId } : {}) },
      _sum: { grossCents: true, netProfitCents: true },
      _count: true,
    }),
    prisma.brand.findMany({ where: { organizationId }, select: { id: true, slug: true, domain: true } }),
    prisma.affiliateOrderAttribution.aggregate({
      where: { affiliate: { organizationId }, ...(brandId ? { order: { brandId } } : {}) },
      _sum: { commissionCents: true },
    }),
  ]);

  // AUD stores (EVLV Australia) are converted to USD for all-store totals;
  // a single selected AUD store is shown in AUD.
  const currencyByBrand = new Map(brands.map((b) => [b.id, brandCurrency(b)]));
  const display = brandId ? (currencyByBrand.get(brandId) ?? "USD") : "USD";
  const conv = (cents: number, id: string) =>
    display === "USD" ? toUsdCents(cents, currencyByBrand.get(id) ?? "USD") : cents;
  const orderAgg = byBrand.reduce(
    (acc, row) => ({
      gross: acc.gross + conv(row._sum.grossCents ?? 0, row.brandId),
      net: acc.net + conv(row._sum.netProfitCents ?? 0, row.brandId),
      count: acc.count + row._count,
    }),
    { gross: 0, net: 0, count: 0 },
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <StatCard label="Gross revenue" value={money(orderAgg.gross, display)} hint={brandId ? "All-time, selected store" : "All-time, all stores"} />
      <StatCard
        label="Net profit"
        value={money(orderAgg.net, display)}
        hint="After COGS, fees, commission"
      />
      <StatCard label="Total orders" value={String(orderAgg.count)} hint="All-time" />
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
