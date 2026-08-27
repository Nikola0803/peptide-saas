import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState, StatCard } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { generateSupplierInvoice } from "./actions";

export default async function DropshipBillingPage() {
  const { supplier } = await requireSupplier();

  const [invoices, unbilledCount] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: "desc" },
      include: { lineItems: true },
    }),
    prisma.orderItem.count({ where: { supplierId: supplier.id, fulfillmentStatus: "SHIPPED", invoiceLineItem: null } }),
  ]);

  const totalOwed = invoices.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.totalCents, 0);

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Auto-generated from what you've shipped, at the rates you set on your products"
        actions={
          unbilledCount > 0 && (
            <form action={generateSupplierInvoice}>
              <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Generate invoice ({unbilledCount} shipped item{unbilledCount === 1 ? "" : "s"} unbilled)
              </button>
            </form>
          )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <StatCard label="Outstanding (unpaid)" value={money(totalOwed)} />
        <StatCard label="Invoices" value={String(invoices.length)} />
      </div>

      {invoices.length === 0 ? (
        <EmptyState icon="ri-bill-line" title="No invoices yet" body="Ship an order, then generate your first invoice from the button above." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="px-4 py-2.5 font-medium">Period</th>
                <th className="px-4 py-2.5 font-medium">Items</th>
                <th className="px-4 py-2.5 font-medium text-right">Total</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-background-100 last:border-0">
                  <td className="px-4 py-2.5 text-foreground-900">
                    {shortDate(inv.periodStart)} – {shortDate(inv.periodEnd)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{inv.lineItems.length}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(inv.totalCents)}</td>
                  <td className="px-4 py-2.5">
                    <Badge status={inv.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <a
                      href={`/api/dropship/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs border border-background-300 rounded px-2 py-1 text-foreground-700 hover:bg-background-100"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
