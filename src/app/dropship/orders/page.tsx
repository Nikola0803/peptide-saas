import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState, StatCard } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { markItemShipped } from "../actions";

interface Params {
  brand?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
}

export default async function DropshipOrdersPage({ searchParams }: { searchParams: Params }) {
  const { supplier } = await requireSupplier();

  const brands = await prisma.brand.findMany({
    where: { organizationId: supplier.organizationId, orders: { some: { items: { some: { supplierId: supplier.id } } } } },
    orderBy: { name: "asc" },
  });

  const q = searchParams.q?.trim();
  const from = searchParams.from ? new Date(searchParams.from) : undefined;
  const to = searchParams.to ? new Date(searchParams.to) : undefined;

  const items = await prisma.orderItem.findMany({
    where: {
      supplierId: supplier.id,
      ...(searchParams.status === "shipped" ? { fulfillmentStatus: "SHIPPED" } : {}),
      ...(searchParams.status !== "shipped" ? { fulfillmentStatus: "PENDING" } : {}),
      order: {
        brandId: searchParams.brand || undefined,
        externalOrderNumber: q ? { contains: q, mode: "insensitive" } : undefined,
        placedAt: from || to ? { gte: from, lte: to } : undefined,
      },
    },
    include: { order: { include: { brand: true } } },
    orderBy: { order: { placedAt: "desc" } },
    take: 200,
  });

  const pendingCount = await prisma.orderItem.count({ where: { supplierId: supplier.id, fulfillmentStatus: "PENDING" } });
  const shippedCount = await prisma.orderItem.count({ where: { supplierId: supplier.id, fulfillmentStatus: "SHIPPED" } });

  const keepParams = (overrides: Partial<Params>) => {
    const merged = { ...searchParams, ...overrides };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, v);
    return `/dropship/orders?${usp.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Orders" subtitle="Only the items assigned to you — pack and ship, then mark it shipped with a tracking number" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <StatCard label="Awaiting shipment" value={String(pendingCount)} />
        <StatCard label="Shipped" value={String(shippedCount)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        <FilterLink href={keepParams({ status: undefined })} active={!searchParams.status}>Pending</FilterLink>
        <FilterLink href={keepParams({ status: "shipped" })} active={searchParams.status === "shipped"}>Shipped</FilterLink>
        {brands.length > 1 && (
          <>
            <span className="text-foreground-300">|</span>
            {brands.map((b) => (
              <FilterLink key={b.id} href={keepParams({ brand: b.id })} active={searchParams.brand === b.id}>
                {b.name}
              </FilterLink>
            ))}
          </>
        )}
      </div>

      <form className="flex flex-wrap items-center gap-2 mb-4">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        {searchParams.brand && <input type="hidden" name="brand" value={searchParams.brand} />}
        <input
          name="q"
          defaultValue={searchParams.q}
          placeholder="Order number…"
          className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
        />
        <input type="date" name="from" defaultValue={searchParams.from} className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
        <span className="text-foreground-400 text-xs">to</span>
        <input type="date" name="to" defaultValue={searchParams.to} className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
        <button className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100">Filter</button>
      </form>

      {items.length === 0 ? (
        <EmptyState icon="ri-shopping-bag-3-line" title="Nothing here" body="No order items match this filter." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground-950">{item.order.externalOrderNumber}</span>
                    <Badge status={item.fulfillmentStatus} />
                    <span className="text-xs text-foreground-500">{item.order.brand.name}</span>
                  </div>
                  <p className="text-sm text-foreground-800">
                    {item.name} × {item.quantity}
                  </p>
                  <p className="text-xs text-foreground-500 mt-1">{dateTime(item.order.placedAt)}</p>
                </div>
                <div className="text-right text-xs text-foreground-600 shrink-0">
                  <p className="font-medium text-foreground-900">{item.order.shipToName}</p>
                  <p>{item.order.shipToAddress1}</p>
                  {item.order.shipToAddress2 && <p>{item.order.shipToAddress2}</p>}
                  <p>
                    {item.order.shipToCity}, {item.order.shipToState} {item.order.shipToPostalCode}
                  </p>
                  <p>{item.order.shipToCountry}</p>
                </div>
              </div>

              {item.fulfillmentStatus === "PENDING" ? (
                <form action={markItemShipped.bind(null, item.id)} className="flex items-center gap-2 pt-3 mt-3 border-t border-background-200">
                  <input
                    name="trackingNumber"
                    required
                    placeholder="Tracking number"
                    className="flex-1 text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                  />
                  <input
                    name="carrierCode"
                    placeholder="Carrier (optional)"
                    className="w-40 text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                  />
                  <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 shrink-0">
                    Mark shipped
                  </button>
                </form>
              ) : (
                <p className="text-xs text-foreground-500 pt-3 mt-3 border-t border-background-200">
                  Shipped {item.shippedAt && dateTime(item.shippedAt)} — tracking {item.trackingNumber}
                  {item.carrierCode ? ` (${item.carrierCode})` : ""}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`px-2.5 py-1 rounded-md font-medium ${active ? "bg-primary-500 text-background-50" : "border border-background-300 text-foreground-700 hover:bg-background-100"}`}
    >
      {children}
    </a>
  );
}
