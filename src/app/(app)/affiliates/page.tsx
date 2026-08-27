import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Card, Badge, EmptyState } from "@/components/ui";
import { money, dateTime } from "@/lib/format";
import { approveAffiliate, rejectAffiliate, markPayoutPaid, rejectPayout } from "./actions";

export default async function AffiliatesPage() {
  const { organization } = await requireOrg();

  const [affiliates, storeBrand, pendingPayouts] = await Promise.all([
    prisma.affiliate.findMany({
      where: { organizationId: organization.id },
      include: { attributions: { include: { order: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.brand.findFirst({ where: { organizationId: organization.id, verifiedAt: { not: null } } }),
    prisma.affiliatePayoutRequest.findMany({
      where: { affiliate: { organizationId: organization.id }, status: "REQUESTED" },
      include: { affiliate: true },
      orderBy: { requestedAt: "asc" },
    }),
  ]);

  const pendingApplications = affiliates.filter((a) => a.status === "PENDING");
  const activeAffiliates = affiliates.filter((a) => a.status !== "PENDING");

  const rows = activeAffiliates.map((a) => {
    const revenue = a.attributions.reduce((s, at) => s + at.order.grossCents, 0);
    const commission = a.attributions.reduce((s, at) => s + at.commissionCents, 0);
    return { affiliate: a, revenue, commission, orderCount: a.attributions.length };
  });

  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const withRecentActivity = rows.filter((r) => r.orderCount > 0).length;

  return (
    <div>
      <PageHeader
        title="Affiliates"
        subtitle="Coupon-driven referral tracking"
        actions={
          <Link href="/affiliates/new" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-800 hover:bg-background-100">
            New affiliate
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total affiliates"
          value={String(rows.length)}
          hint={`${withRecentActivity} with recent activity`}
        />
        <StatCard label="Commission owed" value={money(totalCommission)} hint="Across all attributed orders" />
        <StatCard label="Attributed revenue" value={money(totalRevenue)} hint="Driven by affiliate coupons" />
      </div>

      {pendingApplications.length > 0 && (
        <Card className="p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">
            Pending applications <span className="text-foreground-500 font-normal">({pendingApplications.length})</span>
          </h2>
          <ul className="text-sm divide-y divide-background-100">
            {pendingApplications.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-foreground-800 truncate">{a.name}</div>
                  <div className="text-xs text-foreground-500 truncate">{a.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <form action={approveAffiliate.bind(null, a.id)}>
                    <button className="text-xs bg-primary-500 text-background-50 rounded-md px-2.5 py-1.5 font-medium hover:bg-primary-600">Approve</button>
                  </form>
                  <form action={rejectAffiliate.bind(null, a.id)}>
                    <button className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100">Reject</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pendingPayouts.length > 0 && (
        <Card className="p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">
            Payout requests <span className="text-foreground-500 font-normal">({pendingPayouts.length})</span>
          </h2>
          <ul className="text-sm divide-y divide-background-100">
            {pendingPayouts.map((p) => (
              <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-foreground-800 truncate">{p.affiliate.name}</div>
                  <div className="text-xs text-foreground-500 truncate">
                    {p.affiliate.payoutMethod === "BANK_ACH"
                      ? `Bank ACH — ${p.affiliate.bankAccountHolder ?? "?"}, acct ...${(p.affiliate.bankAccountNumber ?? "").slice(-4)}`
                      : `${p.affiliate.payoutMethod ?? "?"} — ${p.affiliate.payoutDestination ?? "?"}`}
                  </div>
                  <div className="text-[10px] text-foreground-400">Requested {dateTime(p.requestedAt)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">{money(p.amountCents)}</span>
                  <form action={markPayoutPaid.bind(null, p.id)}>
                    <button className="text-xs bg-primary-500 text-background-50 rounded-md px-2.5 py-1.5 font-medium hover:bg-primary-600">Mark Paid</button>
                  </form>
                  <form action={rejectPayout.bind(null, p.id)}>
                    <button className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100">Reject</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="ri-award-line"
          title="No affiliates yet"
          body="Add an affiliate and a coupon code — orders using that code will attribute revenue and commission here automatically."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(({ affiliate, revenue, commission, orderCount }) => (
            <Card key={affiliate.id} className="p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full bg-secondary-100 text-secondary-900 flex items-center justify-center text-xs font-semibold shrink-0">
                  {affiliate.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground-950 truncate">{affiliate.name}</div>
                  <div className="text-xs text-foreground-500 font-mono truncate">{affiliate.slug}</div>
                </div>
                {affiliate.status === "REJECTED" && <Badge status="rejected" />}
              </div>

              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-foreground-500">Rate</span>
                <span className="font-medium text-foreground-800">{affiliate.ratePercent}%</span>
              </div>
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-foreground-500">Coupon</span>
                <span className="font-mono text-foreground-800">{affiliate.couponCode}</span>
              </div>
              {storeBrand && (
                <div className="mb-3 rounded-md bg-background-100 px-2 py-1.5 text-[11px] font-mono text-foreground-600 truncate">
                  https://{storeBrand.domain}/?ref={affiliate.couponCode}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-background-200 text-center">
                <div>
                  <div className="text-sm font-semibold text-foreground-950 tabular-nums">{orderCount}</div>
                  <div className="text-[10px] text-foreground-500">Orders</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground-950 tabular-nums">{money(revenue)}</div>
                  <div className="text-[10px] text-foreground-500">Revenue</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-primary-700 tabular-nums">{money(commission)}</div>
                  <div className="text-[10px] text-foreground-500">Commission</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
