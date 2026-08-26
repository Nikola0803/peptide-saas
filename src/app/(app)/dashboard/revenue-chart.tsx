import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { RevenueByBrandChart } from "@/components/revenue-by-brand-chart";

export async function DashboardRevenueChart({ organizationId }: { organizationId: string }) {
  // Only orders that are actually paid count as revenue -- ON_HOLD is
  // reserved-but-unconfirmed, REFUNDED is money given back, neither
  // belongs in a "revenue by brand" total.
  const brands = await prisma.brand.findMany({
    where: { organizationId },
    include: {
      orders: { where: { status: { in: ["COMPLETED", "PROCESSING"] } }, select: { grossCents: true, netProfitCents: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = brands.map((b) => ({
    name: b.name,
    gross: b.orders.reduce((s, o) => s + o.grossCents, 0) / 100,
    net: b.orders.reduce((s, o) => s + (o.netProfitCents ?? 0), 0) / 100,
  }));

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-foreground-950 mb-3">Revenue by brand</h2>
      {data.every((d) => d.gross === 0) ? (
        <p className="text-xs text-foreground-500 py-8 text-center">No revenue recorded yet.</p>
      ) : (
        <RevenueByBrandChart data={data} />
      )}
    </Card>
  );
}

export function DashboardRevenueChartSkeleton() {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-4 h-[280px] animate-pulse">
      <div className="h-4 w-32 bg-background-200 rounded mb-4" />
      <div className="h-[200px] bg-background-100 rounded" />
    </div>
  );
}
