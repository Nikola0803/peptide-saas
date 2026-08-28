import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { linkAndApproveInquiry, rejectInquiry, createWholesaleInvoice, markWholesaleInvoicePaid } from "./actions";

export default async function WholesalePage() {
  const { organization } = await requireOrg();

  const [newInquiries, partners] = await Promise.all([
    prisma.wholesaleInquiry.findMany({ where: { organizationId: organization.id, status: "NEW" }, orderBy: { createdAt: "desc" } }),
    prisma.wholesalePartner.findMany({
      where: { contact: { organizationId: organization.id } },
      include: { contact: true, invoices: { orderBy: { issuedDate: "desc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const approvedPartners = partners.filter((p) => p.status === "APPROVED");
  const outstandingTotal = approvedPartners.reduce(
    (s, p) => s + p.invoices.filter((i) => i.status === "UNPAID").reduce((s2, i) => s2 + i.amountCents, 0),
    0
  );

  return (
    <div>
      <PageHeader title="Wholesale" subtitle="B2B inquiries and dropship/bulk partner invoicing" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="New inquiries" value={String(newInquiries.length)} hint={newInquiries.length > 0 ? "Needs review" : undefined} />
        <StatCard label="Approved partners" value={String(approvedPartners.length)} />
        <StatCard label="Outstanding invoices" value={money(outstandingTotal)} />
      </div>

      {newInquiries.length > 0 && (
        <Card className="p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">New inquiries</h2>
          <ul className="text-sm divide-y divide-background-100">
            {newInquiries.map((inq) => (
              <li key={inq.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-foreground-900 font-medium">{inq.companyName}</div>
                  <div className="text-xs text-foreground-600">
                    {inq.contactName} — {inq.email}
                    {inq.phone ? ` — ${inq.phone}` : ""}
                  </div>
                  {inq.website && <div className="text-xs text-foreground-500">{inq.website}</div>}
                  {inq.monthlyVolume && <div className="text-xs text-foreground-500">Volume: {inq.monthlyVolume}</div>}
                  {inq.message && <p className="text-xs text-foreground-600 mt-1">{inq.message}</p>}
                  <div className="text-[10px] text-foreground-400 mt-1">{shortDate(inq.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <form action={linkAndApproveInquiry.bind(null, inq.id)}>
                    <button className="text-xs bg-primary-500 text-background-50 rounded-md px-2.5 py-1.5 font-medium hover:bg-primary-600">
                      Link &amp; Approve
                    </button>
                  </form>
                  <form action={rejectInquiry.bind(null, inq.id)}>
                    <button className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100">
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Partners</h2>
        {partners.length === 0 ? (
          <EmptyState icon="ri-store-2-line" title="No wholesale partners yet" body="Approve an inquiry above to create one." />
        ) : (
          <div className="space-y-4">
            {partners.map((p) => (
              <div key={p.id} className="rounded-md border border-background-200 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="text-sm font-medium text-foreground-900">{p.businessName || p.contact.name || p.contact.email}</div>
                    <div className="text-xs text-foreground-500">
                      {p.contact.email}
                      {p.notificationEmail && p.notificationEmail !== p.contact.email ? ` — notifications: ${p.notificationEmail}` : ""}
                    </div>
                  </div>
                  <Badge status={p.status} />
                </div>

                {p.status === "APPROVED" && (
                  <>
                    <ul className="text-xs divide-y divide-background-100 mb-2">
                      {p.invoices.length === 0 && <li className="py-1.5 text-foreground-500">No invoices yet.</li>}
                      {p.invoices.map((inv) => (
                        <li key={inv.id} className="py-1.5 flex items-center justify-between gap-2">
                          <span className="text-foreground-800">
                            {inv.label} — {money(inv.amountCents)} — {shortDate(inv.issuedDate)}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge status={inv.status} />
                            {inv.status === "UNPAID" && (
                              <form action={markWholesaleInvoicePaid.bind(null, inv.id)}>
                                <button className="text-xs border border-background-300 rounded px-2 py-0.5 text-foreground-700 hover:bg-background-100">
                                  Mark Paid
                                </button>
                              </form>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <details>
                      <summary className="text-xs text-primary-600 cursor-pointer hover:underline">New invoice</summary>
                      <form action={createWholesaleInvoice.bind(null, p.id)} className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                        <input name="label" placeholder="Label" required className="text-xs border border-background-300 rounded px-2 py-1 bg-background-50 col-span-2" />
                        <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount, $" required className="text-xs border border-background-300 rounded px-2 py-1 bg-background-50" />
                        <input name="paymentMethod" placeholder="zelle/cashapp/venmo/bank_ach" className="text-xs border border-background-300 rounded px-2 py-1 bg-background-50" />
                        <input name="paymentMemo" placeholder="Memo" className="text-xs border border-background-300 rounded px-2 py-1 bg-background-50" />
                        <button className="text-xs border border-background-300 rounded px-2 py-1 text-foreground-700 hover:bg-background-100 col-span-2 sm:col-span-1">
                          Add
                        </button>
                      </form>
                    </details>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
