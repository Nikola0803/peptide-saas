import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui";
import { money, dateTime } from "@/lib/format";
import { recallLot } from "../../../../lot-actions";

export default async function RecallReportPage({ params }: { params: { id: string; lotId: string } }) {
  const { organization } = await requireOrg();

  const lot = await prisma.productLot.findFirst({
    where: { id: params.lotId, productId: params.id, product: { organizationId: organization.id } },
    include: { product: true },
  });
  if (!lot) notFound();

  const affectedItems = await prisma.orderItem.findMany({
    where: { lotId: lot.id },
    include: { order: { include: { brand: true, contact: true } } },
    orderBy: { order: { placedAt: "desc" } },
  });

  const uniqueContacts = new Set(affectedItems.map((i) => i.order.contact?.email).filter(Boolean));
  const totalUnits = affectedItems.reduce((s, i) => s + i.quantity, 0);

  return (
    <div>
      <PageHeader
        title={`Recall — ${lot.lotNumber}`}
        subtitle={lot.product.chemicalName}
        actions={
          <Link
            href={`/products/${lot.productId}`}
            className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100"
          >
            Back to product
          </Link>
        }
      />

      {lot.status !== "RECALLED" ? (
        <Card className="p-4 mb-6 max-w-lg">
          <h2 className="text-sm font-semibold text-foreground-950 mb-1">This batch isn't flagged as recalled yet</h2>
          <p className="text-xs text-foreground-500 mb-3">
            Flagging it makes this list official and keeps it visible from the product page and dashboard.
          </p>
          <form action={recallLot.bind(null, lot.productId, lot.id)} className="space-y-2">
            <input
              name="reason"
              placeholder="Reason (e.g. failed third-party purity test)"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <button className="text-sm bg-accent-600 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-accent-700">
              Flag this batch as recalled
            </button>
          </form>
        </Card>
      ) : (
        <div className="mb-6 rounded-md bg-accent-50 border border-accent-200 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <i className="ri-alert-line text-accent-700" />
            <span className="text-sm font-semibold text-accent-800">Recalled</span>
          </div>
          {lot.recallReason && <p className="text-xs text-accent-800">{lot.recallReason}</p>}
          {lot.recalledAt && <p className="text-xs text-accent-700 mt-0.5">Flagged {dateTime(lot.recalledAt)}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Orders affected" value={String(affectedItems.length)} />
        <StatCard label="Units shipped from this batch" value={String(totalUnits)} />
        <StatCard label="Unique customers" value={String(uniqueContacts.size)} />
      </div>

      <h2 className="text-sm font-semibold text-foreground-950 mb-3">Affected orders</h2>
      {affectedItems.length === 0 ? (
        <EmptyState
          icon="ri-shield-check-line"
          title="No orders used this batch"
          body="Nothing shipped from this lot yet, or it hasn't been used to fulfill an order."
        />
      ) : (
        <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="py-2 px-4 font-medium">Order</th>
                <th className="py-2 px-4 font-medium">Customer</th>
                <th className="py-2 px-4 font-medium">Brand</th>
                <th className="py-2 px-4 font-medium">Status</th>
                <th className="py-2 px-4 font-medium text-right">Qty</th>
                <th className="py-2 px-4 font-medium text-right">Placed</th>
              </tr>
            </thead>
            <tbody>
              {affectedItems.map((item) => (
                <tr key={item.id} className="border-b border-background-100 last:border-0">
                  <td className="py-2.5 px-4 font-mono text-xs text-foreground-800">#{item.order.externalOrderNumber}</td>
                  <td className="py-2.5 px-4 text-foreground-800">{item.order.contact?.email ?? "—"}</td>
                  <td className="py-2.5 px-4 text-foreground-700">{item.order.brand.name}</td>
                  <td className="py-2.5 px-4">
                    <Badge status={item.order.status} />
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-2.5 px-4 text-right text-xs text-foreground-500">{dateTime(item.order.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
