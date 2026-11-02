import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, EmptyState, StatCard } from "@/components/ui";
import { money, dateTime } from "@/lib/format";

export default async function PaymentsPage() {
  const { organization } = await requireOrg();
  const payments = await prisma.order.findMany({
    where: { organizationId: organization.id, paymentMethod: "niftipay" },
    include: { brand: true, contact: true },
    orderBy: { placedAt: "desc" },
    take: 200,
  });
  const paid = payments.filter((order) => order.paymentConfirmedAt);
  const paidCents = paid.reduce((sum, order) => sum + order.grossCents + order.shippingCents, 0);

  return (
    <div>
      <PageHeader title="Payments" subtitle="Niftipay card payments and reconciliation across EVLV markets" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Card orders" value={String(payments.length)} hint="Latest 200 Niftipay orders" />
        <StatCard label="Confirmed" value={String(paid.length)} hint="Confirmed by signed webhook" />
        <StatCard label="Confirmed volume" value={money(paidCents)} hint="Order totals including shipping" />
      </div>
      {payments.length === 0 ? (
        <EmptyState icon="ri-bank-card-line" title="No Niftipay payments yet" body="AU card orders will appear here as soon as checkout creates them." />
      ) : (
        <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-foreground-500 border-b border-background-200">
              <th className="py-2.5 px-4 font-medium">Order</th><th className="py-2.5 px-4 font-medium">Brand</th>
              <th className="py-2.5 px-4 font-medium">Customer</th><th className="py-2.5 px-4 font-medium">Payment</th>
              <th className="py-2.5 px-4 font-medium">Order status</th><th className="py-2.5 px-4 font-medium text-right">Total</th>
              <th className="py-2.5 px-4 font-medium text-right">Placed</th>
            </tr></thead>
            <tbody>{payments.map((order) => (
              <tr key={order.id} className="border-b border-background-100 last:border-0 hover:bg-background-100">
                <td className="py-3 px-4 font-mono text-xs"><Link href={`/orders/${order.id}`}>#{order.externalOrderNumber}</Link></td>
                <td className="py-3 px-4">{order.brand.name}</td><td className="py-3 px-4">{order.contact?.email ?? "—"}</td>
                <td className="py-3 px-4">{order.paymentConfirmedAt ? <span className="text-primary-700">Confirmed {dateTime(order.paymentConfirmedAt)}</span> : <span className="text-accent-700">Awaiting webhook</span>}</td>
                <td className="py-3 px-4"><Badge status={order.status} /></td>
                <td className="py-3 px-4 text-right tabular-nums">{money(order.grossCents + order.shippingCents)}</td>
                <td className="py-3 px-4 text-right text-xs whitespace-nowrap">{dateTime(order.placedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
