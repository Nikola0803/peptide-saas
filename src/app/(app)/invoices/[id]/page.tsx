import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { markInvoiceStatus, deleteInvoice } from "../actions";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrg();

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: { lineItems: true, brand: true, order: true },
  });
  if (!invoice) notFound();

  return (
    <div>
      <PageHeader
        title={invoice.invoiceNumber}
        subtitle={invoice.customerName}
        actions={
          <>
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100"
            >
              Download PDF
            </a>
            <Link href="/invoices" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
              Back
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground-950">Line items</h2>
            <Badge status={invoice.status} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="py-1.5 font-medium">Description</th>
                <th className="py-1.5 font-medium text-right">Qty</th>
                <th className="py-1.5 font-medium text-right">Unit price</th>
                <th className="py-1.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((line) => (
                <tr key={line.id} className="border-b border-background-100 last:border-0">
                  <td className="py-2 text-foreground-800">{line.description}</td>
                  <td className="py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{money(line.unitPriceCents)}</td>
                  <td className="py-2 text-right tabular-nums">{money(line.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end pt-3 mt-2 border-t border-background-200">
            <div className="w-48 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground-600">Subtotal</span>
                <span>{money(invoice.subtotalCents)}</span>
              </div>
              {invoice.taxCents > 0 && (
                <div className="flex justify-between">
                  <span className="text-foreground-600">Tax</span>
                  <span>{money(invoice.taxCents)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-foreground-950">
                <span>Total</span>
                <span>{money(invoice.totalCents)}</span>
              </div>
            </div>
          </div>
          {invoice.notes && (
            <p className="text-xs text-foreground-500 mt-4 pt-3 border-t border-background-200">{invoice.notes}</p>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Details</h2>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-foreground-500">Issued</dt>
                <dd className="text-foreground-800">{shortDate(invoice.issueDate)}</dd>
              </div>
              {invoice.dueDate && (
                <div className="flex justify-between">
                  <dt className="text-foreground-500">Due</dt>
                  <dd className="text-foreground-800">{shortDate(invoice.dueDate)}</dd>
                </div>
              )}
              {invoice.poNumber && (
                <div className="flex justify-between">
                  <dt className="text-foreground-500">PO number</dt>
                  <dd className="text-foreground-800">{invoice.poNumber}</dd>
                </div>
              )}
              {invoice.brand && (
                <div className="flex justify-between">
                  <dt className="text-foreground-500">Brand</dt>
                  <dd className="text-foreground-800">{invoice.brand.name}</dd>
                </div>
              )}
              {invoice.order && (
                <div className="flex justify-between">
                  <dt className="text-foreground-500">Order</dt>
                  <dd>
                    <Link href={`/orders/${invoice.order.id}`} className="text-primary-600 hover:underline">
                      #{invoice.order.externalOrderNumber}
                    </Link>
                  </dd>
                </div>
              )}
              {invoice.paidAt && (
                <div className="flex justify-between">
                  <dt className="text-foreground-500">Paid</dt>
                  <dd className="text-foreground-800">{shortDate(invoice.paidAt)}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Status</h2>
            <div className="grid grid-cols-2 gap-2">
              {(["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"] as const).map((s) => (
                <form key={s} action={markInvoiceStatus.bind(null, invoice.id, s)}>
                  <button
                    disabled={invoice.status === s}
                    className="w-full text-xs border border-background-300 rounded px-2 py-1.5 text-foreground-700 hover:bg-background-100 disabled:opacity-40 disabled:cursor-default capitalize"
                  >
                    {s.toLowerCase()}
                  </button>
                </form>
              ))}
            </div>
            <form action={deleteInvoice.bind(null, invoice.id)} className="mt-3 pt-3 border-t border-background-200">
              <button className="text-xs text-accent-700 hover:underline">Delete invoice</button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
