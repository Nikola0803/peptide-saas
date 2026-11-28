import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui";
import { money } from "@/lib/format";
import { brandCurrency, toUsdCents } from "@/lib/store-currency";

export async function DashboardKpis({ organizationId, brandId }: { organizationId: string; brandId?: string }) {
  // Revenue and profit count paid orders only (completed + processing),
  // the same rule as the Earnings card and the Expenses page. Unpaid
  // on-hold, cancelled, failed and refunded orders used to be summed here
  // too, which made this card show more profit than was ever received.
  const [byBrand, allOrders, brands, openCommission] = await Promise.all([
    prisma.order.groupBy({
      by: ["brandId"],
      where: { organizationId, ...(brandId ? { brandId } : {}), status: { in: ["COMPLETED", "PROCESSING"] } },
      _sum: { grossCents: true, netProfitCents: true },
      _count: true,
    }),
    prisma.order.count({ where: { organizationId, ...(brandId ? { brandId } : {}) } }),
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
      <StatCard label="Gross revenue" value={money(orderAgg.gross, display)} hint={`Paid orders, all-time, ${brandId ? "selected store" : "all stores"}`} />
      <StatCard
        label="Net profit"
        value={money(orderAgg.net, display)}
        hint="Paid orders, after COGS, fees, commission"
      />
      <StatCard label="Paid orders" value={String(orderAgg.count)} hint={`${allOrders} placed all-time, incl. unpaid/cancelled`} />
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
