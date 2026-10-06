import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Card, Badge } from "@/components/ui";
import { money, dateTime } from "@/lib/format";
import { affiliateLevelForRevenue } from "@/lib/affiliate-program";
import { updateAffiliateProgram } from "../actions";

export default async function AffiliateDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrg();
  const affiliate = await prisma.affiliate.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: {
      clicks: { orderBy: { createdAt: "desc" }, take: 1 },
      attributions: {
        include: { order: { select: { orderSeq: true, status: true, grossCents: true, placedAt: true } } },
        orderBy: { order: { placedAt: "desc" } },
      },
      payoutRequests: { orderBy: { requestedAt: "desc" } },
    },
  });
  if (!affiliate) notFound();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [clicksTotal, clicks30d] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId: affiliate.id } }),
    prisma.affiliateClick.count({ where: { affiliateId: affiliate.id, createdAt: { gte: thirtyDaysAgo } } }),
  ]);
  const confirmed = affiliate.attributions.filter((row) => row.order.status === "COMPLETED");
  const pending = affiliate.attributions.filter((row) => row.order.status === "ON_HOLD" || row.order.status === "PROCESSING");
  const revenue = confirmed.reduce((sum, row) => sum + row.order.grossCents, 0);
  const earned = confirmed.reduce((sum, row) => sum + row.commissionCents, 0);
  const paid = affiliate.payoutRequests.filter((row) => row.status === "PAID").reduce((sum, row) => sum + row.amountCents, 0);
  const requested = affiliate.payoutRequests.filter((row) => row.status === "REQUESTED").reduce((sum, row) => sum + row.amountCents, 0);
  const available = Math.max(0, earned - paid - requested);
  const level = affiliateLevelForRevenue(revenue);
  const effectiveRate = Math.max(0, affiliate.ratePercent - affiliate.customerDiscountPercent);

  return <div>
    <PageHeader
      title={affiliate.name}
      subtitle={`Partner since ${dateTime(affiliate.createdAt)}`}
      actions={<Link href="/affiliates" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">Back to affiliates</Link>}
    />

    <div className="mb-6 flex flex-wrap items-center gap-2">
      <Badge status={affiliate.status.toLowerCase()} />
      <span className="rounded-full bg-secondary-100 px-2.5 py-1 text-xs font-medium text-secondary-900">{level.current.name} level</span>
      <span className="rounded-full bg-background-100 px-2.5 py-1 text-xs font-mono text-foreground-700">{affiliate.couponCode}</span>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard label="Confirmed revenue" value={money(revenue)} hint={`${confirmed.length} completed conversions`} />
      <StatCard label="Commission earned" value={money(earned)} hint={`${effectiveRate}% effective rate`} />
      <StatCard label="Available balance" value={money(available)} hint={`${money(requested)} requested`} />
      <StatCard label="Traffic" value={String(clicksTotal)} hint={`${clicks30d} clicks in 30 days`} />
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground-950">Program controls</h2>
          <p className="mt-1 text-xs text-foreground-500">The assigned rate is split between the public customer reward and partner commission. Changes affect future orders only.</p>
          <form action={updateAffiliateProgram.bind(null, affiliate.id)} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-foreground-600">Public code
              <input name="couponCode" required defaultValue={affiliate.couponCode} className="mt-1 w-full rounded border border-background-300 bg-background-50 px-3 py-2 font-mono uppercase" />
            </label>
            <label className="text-xs text-foreground-600">Status
              <select name="status" defaultValue={affiliate.status} className="mt-1 w-full rounded border border-background-300 bg-background-50 px-3 py-2">
                <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
              </select>
            </label>
            <label className="text-xs text-foreground-600">Total assigned rate (%)
              <input name="ratePercent" type="number" min="0" max="40" step="0.1" required defaultValue={affiliate.ratePercent} className="mt-1 w-full rounded border border-background-300 bg-background-50 px-3 py-2" />
            </label>
            <label className="text-xs text-foreground-600">Current customer discount (%)
              <input name="customerDiscountPercent" type="number" min="0" max={Math.min(30, Math.floor(affiliate.ratePercent))} step="1" required defaultValue={affiliate.customerDiscountPercent} className="mt-1 w-full rounded border border-background-300 bg-background-50 px-3 py-2" />
            </label>
            <div className="sm:col-span-2 rounded-md bg-background-100 p-3 text-xs text-foreground-600">
              Current split: <strong>{affiliate.customerDiscountPercent}% customer discount</strong> + <strong>{effectiveRate}% partner commission</strong>. Codes never stack and checkout still enforces the margin floor.
            </div>
            <button className="sm:col-span-2 justify-self-start rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-background-50 hover:bg-primary-600">Save partner controls</button>
          </form>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-semibold text-foreground-950">Conversion ledger</h2><p className="mt-1 text-xs text-foreground-500">Newest attributed orders first</p></div><span className="text-xs text-foreground-500">{pending.length} pending</span></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-background-200 text-left text-xs text-foreground-500"><th className="pb-2">Order</th><th className="pb-2">Date</th><th className="pb-2">Status</th><th className="pb-2 text-right">Revenue</th><th className="pb-2 text-right">Commission</th></tr></thead><tbody>
            {affiliate.attributions.slice(0, 100).map((row) => <tr key={row.id} className="border-b border-background-100"><td className="py-2"><Link href={`/orders/${row.orderId}`} className="font-mono text-primary-700 hover:underline">#{row.order.orderSeq}</Link></td><td className="py-2 text-foreground-600">{dateTime(row.order.placedAt)}</td><td className="py-2"><Badge status={row.order.status.toLowerCase()} /></td><td className="py-2 text-right">{money(row.order.grossCents)}</td><td className="py-2 text-right font-medium">{money(row.commissionCents)}</td></tr>)}
          </tbody></table>{affiliate.attributions.length === 0 && <p className="py-8 text-center text-sm text-foreground-500">No attributed orders yet.</p>}</div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5"><h2 className="text-sm font-semibold text-foreground-950">Level progress</h2><div className="mt-4 flex items-end justify-between"><div><p className="text-2xl font-semibold">{level.current.name}</p><p className="text-xs text-foreground-500">Current program level</p></div><span className="text-xs font-medium text-primary-700">{level.progressPercent}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-background-200"><div className="h-full rounded-full bg-primary-500" style={{ width: `${level.progressPercent}%` }} /></div><p className="mt-3 text-xs text-foreground-500">{level.next ? `${money(level.revenueToNextCents)} confirmed revenue until ${level.next.name}` : "Top level reached"}</p></Card>
        <Card className="p-5"><h2 className="text-sm font-semibold text-foreground-950">Partner profile</h2><dl className="mt-4 space-y-3 text-xs">
          <Info label="Email" value={affiliate.email} /><Info label="Phone" value={affiliate.phone} /><Info label="Country" value={affiliate.country} /><Info label="Referred by" value={affiliate.referredBy} />
          {affiliate.socialLink && <div><dt className="text-foreground-500">Primary channel</dt><dd className="mt-0.5 break-all"><a className="text-primary-700 hover:underline" href={affiliate.socialLink} target="_blank" rel="noreferrer">{affiliate.socialLink}</a></dd></div>}
          <Info label="Last click" value={affiliate.clicks[0] ? dateTime(affiliate.clicks[0].createdAt) : "No clicks yet"} />
        </dl></Card>
        <Card className="p-5"><h2 className="text-sm font-semibold text-foreground-950">Payouts</h2><div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Paid" value={money(paid)} /><Mini label="Requested" value={money(requested)} /></div><div className="mt-4 space-y-2">{affiliate.payoutRequests.slice(0, 8).map((row) => <div key={row.id} className="flex items-center justify-between rounded bg-background-100 px-3 py-2 text-xs"><span>{money(row.amountCents)}</span><Badge status={row.status.toLowerCase()} /></div>)}{affiliate.payoutRequests.length === 0 && <p className="text-xs text-foreground-500">No payout history.</p>}</div></Card>
      </div>
    </div>
  </div>;
}

function Info({ label, value }: { label: string; value?: string | null }) { return <div><dt className="text-foreground-500">{label}</dt><dd className="mt-0.5 text-foreground-800">{value || "—"}</dd></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded bg-background-100 p-3"><p className="text-[10px] uppercase tracking-wide text-foreground-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
