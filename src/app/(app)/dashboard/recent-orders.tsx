import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { money, dateTime } from "@/lib/format";

export async function DashboardRecentOrders({ organizationId }: { organizationId: string }) {
  const recentOrders = await prisma.order.findMany({
    where: { organizationId },
    orderBy: { placedAt: "desc" },
    take: 6,
    include: { brand: true, contact: true },
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground-950">Recent orders</h2>
        <Link href="/orders" className="text-xs text-primary-600 font-medium hover:underline">
          View all
        </Link>
      </div>
      {recentOrders.length === 0 ? (
        <EmptyState
          icon="ri-shopping-bag-3-line"
          title="No orders yet"
          body="Once a brand's WooCommerce store is connected, orders will appear here in real time."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="py-2 font-medium">Order</th>
                <th className="py-2 font-medium">Customer</th>
                <th className="py-2 font-medium">Brand</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium text-right">Gross</th>
                <th className="py-2 font-medium text-right">Placed</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-b border-background-100 last:border-0">
                  <td className="py-2.5 font-mono text-xs text-foreground-700">#{o.externalOrderNumber}</td>
                  <td className="py-2.5 text-foreground-800">{o.contact?.email ?? "—"}</td>
                  <td className="py-2.5 text-foreground-700">{o.brand.name}</td>
                  <td className="py-2.5">
                    <Badge status={o.status} />
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{money(o.grossCents)}</td>
                  <td className="py-2.5 text-right text-xs text-foreground-500">{dateTime(o.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function DashboardRecentOrdersSkeleton() {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-4 h-[280px] animate-pulse">
      <div className="h-4 w-28 bg-background-200 rounded mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 bg-background-100 rounded mb-2" />
      ))}
    </div>
  );
}
