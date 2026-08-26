import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { money, dateTime } from "@/lib/format";
import { addOrderNote, setFraudFlag, addRefund, updateRefundStatus } from "../actions";

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrg();

  const order = await prisma.order.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: {
      items: { include: { supplier: true } },
      brand: true,
      contact: true,
      notes: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  const totalRefunded = order.refunds
    .filter((r) => r.status !== "LOST")
    .reduce((s, r) => s + r.amountCents, 0);

  return (
    <div>
      <PageHeader
        title={`Order #${order.externalOrderNumber}`}
        subtitle={`${order.brand.name} · ${dateTime(order.placedAt)}`}
        actions={
          <>
            <a
              href={`/api/orders/${order.id}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100"
            >
              Download receipt
            </a>
            <Link
              href={`/invoices/new?orderId=${order.id}`}
              className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600"
            >
              Create invoice
            </Link>
          </>
        }
      />

      {order.flaggedRisk && (
        <div className="mb-4 rounded-md bg-accent-50 border border-accent-300 px-4 py-3">
          <div className="flex items-center gap-2">
            <i className="ri-alert-line text-accent-700" />
            <span className="text-sm font-semibold text-accent-800">Flagged for risk review</span>
          </div>
          {order.riskReason && <p className="text-xs text-accent-800 mt-1">{order.riskReason}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground-950">Items</h2>
              <Badge status={order.status} />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                  <th className="py-1.5 font-medium">Item</th>
                  <th className="py-1.5 font-medium">SKU</th>
                  <th className="py-1.5 font-medium">Fulfilled by</th>
                  <th className="py-1.5 font-medium text-right">Qty</th>
                  <th className="py-1.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-background-100 last:border-0">
                    <td className="py-2 text-foreground-800">{item.name}</td>
                    <td className="py-2 font-mono text-xs text-foreground-600">{item.sku}</td>
                    <td className="py-2 text-xs">
                      {item.supplier ? (
                        <span className="inline-flex items-center gap-1">
                          {item.supplier.name}
                          <Badge status={item.fulfillmentStatus} />
                        </span>
                      ) : (
                        <span className="text-foreground-400">In-house</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{money(item.unitPriceCents * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between pt-3 mt-2 border-t border-background-200 text-sm">
              <span className="text-foreground-600">Gross</span>
              <span className="font-medium text-foreground-950">{money(order.grossCents)}</span>
            </div>
            {order.netProfitCents != null && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-foreground-600">Net profit</span>
                <span className="text-foreground-800">{money(order.netProfitCents)}</span>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground-950">Refunds & chargebacks</h2>
              {totalRefunded > 0 && (
                <span className="text-xs text-accent-700 font-medium">{money(totalRefunded)} total</span>
              )}
            </div>

            {order.refunds.length === 0 ? (
              <p className="text-xs text-foreground-500 mb-3">None logged.</p>
            ) : (
              <div className="space-y-2 mb-3">
                {order.refunds.map((r) => (
                  <div key={r.id} className="rounded-md border border-background-200 p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground-800 uppercase">{r.type}</span>
                        <Badge status={r.status} />
                        <span className="text-sm font-medium text-foreground-950">{money(r.amountCents)}</span>
                      </div>
                      {r.type === "CHARGEBACK" && r.status === "PENDING" && (
                        <div className="flex items-center gap-1.5">
                          <form action={updateRefundStatus.bind(null, order.id, r.id, "WON")}>
                            <button className="text-xs text-primary-600 hover:underline">Mark won</button>
                          </form>
                          <form action={updateRefundStatus.bind(null, order.id, r.id, "LOST")}>
                            <button className="text-xs text-accent-700 hover:underline">Mark lost</button>
                          </form>
                        </div>
                      )}
                      {r.type === "REFUND" && r.status === "PENDING" && (
                        <form action={updateRefundStatus.bind(null, order.id, r.id, "COMPLETED")}>
                          <button className="text-xs text-primary-600 hover:underline">Mark completed</button>
                        </form>
                      )}
                    </div>
                    {r.reason && <p className="text-xs text-foreground-500">{r.reason}</p>}
                    <p className="text-[11px] text-foreground-400 mt-1">{dateTime(r.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}

            <form action={addRefund.bind(null, order.id)} className="flex flex-wrap items-end gap-2 pt-2 border-t border-background-200">
              <div>
                <label className="block text-[11px] text-foreground-500 mb-1">Type</label>
                <select name="type" className="text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50">
                  <option value="REFUND">Refund</option>
                  <option value="CHARGEBACK">Chargeback</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-foreground-500 mb-1">Amount (USD)</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  className="w-24 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-[11px] text-foreground-500 mb-1">Reason</label>
                <input
                  name="reason"
                  placeholder="Optional"
                  className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
              </div>
              <button className="text-xs bg-primary-500 text-background-50 rounded px-2.5 py-1.5 font-medium hover:bg-primary-600">
                Log it
              </button>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Order details</h2>
            <dl className="space-y-1.5 text-xs mb-3">
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-500">Customer</dt>
                <dd className="text-foreground-800 text-right">{order.contact?.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-500">IP address</dt>
                <dd className="text-foreground-800 font-mono">{order.ipAddress ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-500 shrink-0">User agent</dt>
                <dd className="text-foreground-800 text-right break-all">{order.userAgent ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-500">Payment method</dt>
                <dd className="text-foreground-800">{order.paymentMethod ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-500 shrink-0">Payment memo</dt>
                <dd className="text-foreground-800 font-mono text-right break-all">{order.paymentMemo ?? "—"}</dd>
              </div>
              <div className="pt-1.5 border-t border-background-200">
                <dt className="text-foreground-500 mb-0.5">Ship to</dt>
                <dd className="text-foreground-800">
                  {order.shipToName || "—"}
                  {order.shipToAddress1 && <><br />{order.shipToAddress1}</>}
                  {order.shipToAddress2 && <><br />{order.shipToAddress2}</>}
                  {(order.shipToCity || order.shipToState || order.shipToPostalCode) && (
                    <><br />{[order.shipToCity, order.shipToState, order.shipToPostalCode].filter(Boolean).join(", ")}</>
                  )}
                  {order.shipToCountry && <><br />{order.shipToCountry}</>}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Risk review</h2>
            {order.flaggedRisk ? (
              <form action={setFraudFlag.bind(null, order.id, false)}>
                <button className="text-xs border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
                  Clear flag
                </button>
              </form>
            ) : (
              <form action={setFraudFlag.bind(null, order.id, true)} className="space-y-2">
                <input
                  name="riskReason"
                  placeholder="Reason (e.g. billing/shipping mismatch)"
                  className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
                <button className="text-xs bg-accent-600 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-accent-700">
                  Flag for review
                </button>
              </form>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Notes</h2>
            <div className="space-y-2 mb-3 max-h-72 overflow-y-auto">
              {order.notes.length === 0 && <p className="text-xs text-foreground-500">No notes yet.</p>}
              {order.notes.map((note) => (
                <div key={note.id} className="text-xs">
                  <p className="text-foreground-800">{note.body}</p>
                  <p className="text-foreground-400 mt-0.5">{dateTime(note.createdAt)}</p>
                </div>
              ))}
            </div>
            <form action={addOrderNote.bind(null, order.id)} className="flex items-start gap-2">
              <textarea
                name="body"
                required
                rows={2}
                placeholder="Add a note…"
                className="flex-1 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50 resize-none"
              />
              <button className="text-xs border border-background-300 rounded px-2.5 py-1.5 text-foreground-700 hover:bg-background-100 self-stretch">
                Add
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
