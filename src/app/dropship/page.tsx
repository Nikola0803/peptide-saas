import Link from "next/link";
import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { money, dateTime } from "@/lib/format";

const LOW_STOCK_THRESHOLD = 10;

export default async function DropshipDashboardPage() {
  const { supplier } = await requireSupplier();

  const [pendingCount, shippedThisWeek, unbilledCount, lowStockProducts, recentShipped] = await Promise.all([
    prisma.orderItem.count({ where: { supplierId: supplier.id, fulfillmentStatus: "PENDING" } }),
    prisma.orderItem.count({
      where: { supplierId: supplier.id, fulfillmentStatus: "SHIPPED", shippedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.orderItem.count({ where: { supplierId: supplier.id, fulfillmentStatus: "SHIPPED", invoiceLineItem: null } }),
    prisma.supplierProduct.findMany({
      where: { supplierId: supplier.id, active: true, stock: { lte: LOW_STOCK_THRESHOLD } },
      include: { product: true },
      orderBy: { stock: "asc" },
    }),
    prisma.orderItem.findMany({
      where: { supplierId: supplier.id, fulfillmentStatus: "SHIPPED" },
      orderBy: { shippedAt: "desc" },
      take: 5,
      include: { order: true },
    }),
  ]);

  const unpaidInvoices = await prisma.supplierInvoice.findMany({
    where: { supplierId: supplier.id, status: { not: "PAID" } },
  });
  const owed = unpaidInvoices.reduce((s, i) => s + i.totalCents, 0);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${supplier.name}`} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Awaiting shipment" value={String(pendingCount)} hint={pendingCount > 0 ? "Needs action" : "All caught up"} />
        <StatCard label="Shipped this week" value={String(shippedThisWeek)} />
        <StatCard label="Unbilled shipped items" value={String(unbilledCount)} hint={unbilledCount > 0 ? "Ready to invoice" : undefined} />
        <StatCard label="Outstanding balance" value={money(owed)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground-950">Needs attention</h2>
            <Link href="/dropship/orders" className="text-xs text-primary-600 hover:underline">
              View all orders
            </Link>
          </div>
          {pendingCount === 0 ? (
            <p className="text-xs text-foreground-500">Nothing pending — you're caught up.</p>
          ) : (
            <p className="text-sm text-foreground-800">
              {pendingCount} item{pendingCount === 1 ? "" : "s"} waiting to ship.{" "}
              <Link href="/dropship/orders" className="text-primary-600 hover:underline">
                Go ship them
              </Link>
            </p>
          )}
          {unbilledCount > 0 && (
            <p className="text-sm text-foreground-800 mt-2">
              {unbilledCount} shipped item{unbilledCount === 1 ? "" : "s"} not yet invoiced.{" "}
              <Link href="/dropship/billing" className="text-primary-600 hover:underline">
                Generate invoice
              </Link>
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground-950">Low stock</h2>
            <Link href="/dropship/products" className="text-xs text-primary-600 hover:underline">
              Manage products
            </Link>
          </div>
          {lowStockProducts.length === 0 ? (
            <p className="text-xs text-foreground-500">Nothing low — all active products above {LOW_STOCK_THRESHOLD} units.</p>
          ) : (
            <ul className="text-sm space-y-1.5">
              {lowStockProducts.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span className="text-foreground-800">{p.product.chemicalName}</span>
                  <span className={p.stock === 0 ? "text-accent-700 font-semibold" : "text-accent-700"}>{p.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-4 mt-4">
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Recently shipped</h2>
        {recentShipped.length === 0 ? (
          <EmptyState icon="ri-truck-line" title="Nothing shipped yet" body="Ship your first order and it'll show up here." />
        ) : (
          <ul className="text-sm divide-y divide-background-100">
            {recentShipped.map((item) => (
              <li key={item.id} className="py-2 flex justify-between">
                <span className="text-foreground-800">
                  {item.order.externalOrderNumber} — {item.name} × {item.quantity}
                </span>
                <span className="text-xs text-foreground-500">{item.shippedAt && dateTime(item.shippedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
