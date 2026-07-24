import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { money, shortDate } from "@/lib/format";

export default async function InvoicesPage() {
  const { organization } = await requireOrg();

  const invoices = await prisma.invoice.findMany({
    where: { organizationId: organization.id },
    orderBy: { issueDate: "desc" },
    include: { brand: true },
  });

  const outstanding = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE");
  const outstandingCents = outstanding.reduce((s, i) => s + i.totalCents, 0);
  const paidCents = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalCents, 0);

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Wholesale invoices and ad-hoc quotes"
        actions={
          <Link href="/invoices/new" className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
            New invoice
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Outstanding" value={money(outstandingCents)} hint={`${outstanding.length} unpaid`} />
        <StatCard label="Paid" value={money(paidCents)} hint="All-time" />
        <StatCard label="Total invoices" value={String(invoices.length)} />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon="ri-file-list-3-line"
          title="No invoices yet"
          body="Create one from scratch, or from any order's detail page."
        />
      ) : (
        <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="py-2.5 px-4 font-medium">Invoice</th>
                <th className="py-2.5 px-4 font-medium">Customer</th>
                <th className="py-2.5 px-4 font-medium">Brand</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium text-right">Total</th>
                <th className="py-2.5 px-4 font-medium text-right">Issued</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-background-100 last:border-0 hover:bg-background-100">
                  <td className="py-3 px-4 font-mono text-xs text-foreground-800">
                    <Link href={`/invoices/${inv.id}`} className="block">{inv.invoiceNumber}</Link>
                  </td>
                  <td className="py-3 px-4 text-foreground-800">
                    <Link href={`/invoices/${inv.id}`} className="block">{inv.customerName}</Link>
                  </td>
                  <td className="py-3 px-4 text-foreground-700">{inv.brand?.name ?? "—"}</td>
                  <td className="py-3 px-4">
                    <Badge status={inv.status} />
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">{money(inv.totalCents)}</td>
                  <td className="py-3 px-4 text-right text-xs text-foreground-500">{shortDate(inv.issueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
