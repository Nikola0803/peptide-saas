import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { SendEmailButton } from "@/components/send-email-button";
import { linkAndApproveInquiry, rejectInquiry, createWholesaleInvoice, markWholesaleInvoicePaid } from "../wholesale/actions";

export default async function EvlvResellerPage() {
  const { organization } = await requireOrg();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [newSignups, partners] = await Promise.all([
    prisma.wholesaleInquiry.findMany({
      where: { organizationId: organization.id, status: "NEW" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.wholesalePartner.findMany({
      where: { contact: { organizationId: organization.id } },
      include: { contact: true, invoices: { orderBy: { issuedDate: "desc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const approved = partners.filter((p) => p.status === "APPROVED");
  const thisMonthSignups = await prisma.wholesaleInquiry.count({
    where: { organizationId: organization.id, createdAt: { gte: startOfMonth } },
  });

  const revenueTotal = approved.reduce(
    (s, p) => s + p.invoices.filter((i) => i.status === "PAID").reduce((s2, i) => s2 + i.amountCents, 0),
    0
  );
  const outstandingTotal = approved.reduce(
    (s, p) => s + p.invoices.filter((i) => i.status === "UNPAID").reduce((s2, i) => s2 + i.amountCents, 0),
    0
  );

  return (
    <div>
      <PageHeader
        title="EVLV Reseller"
        subtitle="Reseller accounts · signups · invoicing"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active resellers" value={String(approved.length)} />
        <StatCard label="Pending signups" value={String(newSignups.length)} hint={newSignups.length > 0 ? "Needs review" : undefined} />
        <StatCard label="New this month" value={String(thisMonthSignups)} />
        <StatCard label="Outstanding" value={money(outstandingTotal)} hint={`${money(revenueTotal)} total paid`} />
      </div>

      {newSignups.length > 0 && (
        <Card className="p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">
            Pending signups <span className="text-foreground-500 font-normal">({newSignups.length})</span>
          </h2>
          <ul className="text-sm divide-y divide-background-100">
            {newSignups.map((s) => (
              <li key={s.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground-900">{s.companyName}</span>
                    {s.programType && (
                      <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                        {s.programType}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-foreground-600 mt-0.5">
                    {s.contactName} · {s.email}{s.phone ? ` · ${s.phone}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-x-4 text-[11px] text-foreground-500 mt-1">
                    {s.website && <span>{s.website}</span>}
                    {s.monthlyVolume && <span>Est. volume: {s.monthlyVolume}</span>}
                    <span>{shortDate(s.createdAt)}</span>
                  </div>
                  {s.message && <p className="text-xs text-foreground-600 mt-1 line-clamp-2">{s.message}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SendEmailButton email={s.email} name={s.contactName || undefined} />
                  <form action={linkAndApproveInquiry.bind(null, s.id)}>
                    <button className="text-xs bg-primary-500 text-background-50 rounded-md px-2.5 py-1.5 font-medium hover:bg-primary-600">
                      Approve
                    </button>
                  </form>
                  <form action={rejectInquiry.bind(null, s.id)}>
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
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">
          All resellers <span className="text-foreground-500 font-normal">({partners.length})</span>
        </h2>
        {partners.length === 0 ? (
          <EmptyState
            icon="ri-store-3-line"
            title="No resellers yet"
            body="Approve a signup above to onboard your first reseller."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                  <th className="py-2.5 px-3 font-medium">Business</th>
                  <th className="py-2.5 px-3 font-medium">Contact</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Joined</th>
                  <th className="py-2.5 px-3 font-medium text-right">Total paid</th>
                  <th className="py-2.5 px-3 font-medium text-right">Outstanding</th>
                  <th className="py-2.5 px-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => {
                  const paid = p.invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amountCents, 0);
                  const outstanding = p.invoices.filter((i) => i.status === "UNPAID").reduce((s, i) => s + i.amountCents, 0);
                  return (
                    <tr key={p.id} className="border-b border-background-100 last:border-0 hover:bg-background-100">
                      <td className="py-3 px-3">
                        <div className="font-medium text-foreground-900 text-sm">{p.businessName || p.contact.name || p.contact.email}</div>
                        {p.notificationEmail && p.notificationEmail !== p.contact.email && (
                          <div className="text-[11px] text-foreground-400">notif: {p.notificationEmail}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-foreground-600">
                        {p.contact.name && <div>{p.contact.name}</div>}
                        <div>{p.contact.email}</div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge status={p.status} />
                      </td>
                      <td className="py-3 px-3 text-xs text-foreground-500">{shortDate(p.createdAt)}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-medium text-foreground-800">{money(paid)}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-medium">
                        {outstanding > 0 ? (
                          <span className="text-accent-700">{money(outstanding)}</span>
                        ) : (
                          <span className="text-foreground-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 justify-end">
                          <SendEmailButton email={p.contact.email} name={p.businessName || p.contact.name || undefined} />
                          {p.status === "APPROVED" && (
                            <details className="relative">
                              <summary className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100 cursor-pointer list-none">
                                Invoice
                              </summary>
                              <div className="absolute right-0 top-8 z-10 bg-background-50 border border-background-200 rounded-lg shadow-lg p-3 w-72">
                                <p className="text-xs font-semibold text-foreground-800 mb-2">New invoice</p>
                                <form action={createWholesaleInvoice.bind(null, p.id)} className="space-y-1.5">
                                  <input name="label" placeholder="Label" required className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50" />
                                  <div className="flex gap-1.5">
                                    <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount, $" required className="flex-1 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50" />
                                    <input name="paymentMethod" placeholder="Method" className="flex-1 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50" />
                                  </div>
                                  <input name="paymentMemo" placeholder="Memo" className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50" />
                                  <button className="w-full text-xs bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">Add invoice</button>
                                </form>
                                {p.invoices.length > 0 && (
                                  <ul className="mt-3 divide-y divide-background-100">
                                    {p.invoices.slice(0, 5).map((inv) => (
                                      <li key={inv.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                                        <span className="text-foreground-700 truncate">{inv.label} · {money(inv.amountCents)}</span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <Badge status={inv.status} />
                                          {inv.status === "UNPAID" && (
                                            <form action={markWholesaleInvoicePaid.bind(null, inv.id)}>
                                              <button className="text-[11px] border border-background-300 rounded px-1.5 py-0.5 text-foreground-700 hover:bg-background-100">Paid</button>
                                            </form>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
