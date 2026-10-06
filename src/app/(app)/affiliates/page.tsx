import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Card, Badge, EmptyState } from "@/components/ui";
import { money, dateTime } from "@/lib/format";
import { approveAffiliate, rejectAffiliate, markPayoutPaid, rejectPayout } from "./actions";

const PAGE_SIZE = 50;

export default async function AffiliatesPage({ searchParams }: { searchParams?: { page?: string; q?: string } }) {
  const { organization } = await requireOrg();
  const page = Math.max(1, Number(searchParams?.page) || 1);
  const query = searchParams?.q?.trim() || "";
  const activeWhere = {
    organizationId: organization.id,
    status: { not: "PENDING" as const },
    ...(query ? { OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { email: { contains: query, mode: "insensitive" as const } },
      { couponCode: { contains: query, mode: "insensitive" as const } },
    ] } : {}),
  };

  const [activeAffiliates, activeCount, pendingApplications, storeBrand, pendingPayouts, globalAttributions] = await Promise.all([
    prisma.affiliate.findMany({
      where: activeWhere,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.affiliate.count({ where: activeWhere }),
    prisma.affiliate.findMany({ where: { organizationId: organization.id, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.brand.findFirst({ where: { organizationId: organization.id, verifiedAt: { not: null } } }),
    prisma.affiliatePayoutRequest.findMany({
      where: { affiliate: { organizationId: organization.id }, status: "REQUESTED" },
      include: { affiliate: true },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.affiliateOrderAttribution.findMany({
      where: { affiliate: { organizationId: organization.id }, order: { status: "COMPLETED" } },
      select: { affiliateId: true, commissionCents: true, order: { select: { grossCents: true } } },
    }),
  ]);

  const pageAttributions = activeAffiliates.length
    ? await prisma.affiliateOrderAttribution.findMany({
        where: { affiliateId: { in: activeAffiliates.map((affiliate) => affiliate.id) } },
        select: { affiliateId: true, commissionCents: true, order: { select: { grossCents: true } } },
      })
    : [];

  const rows = activeAffiliates.map((a) => {
    const attributions = pageAttributions.filter((row) => row.affiliateId === a.id);
    const revenue = attributions.reduce((s, at) => s + at.order.grossCents, 0);
    const commission = attributions.reduce((s, at) => s + at.commissionCents, 0);
    return { affiliate: a, revenue, commission, orderCount: attributions.length };
  });

  const totalCommission = globalAttributions.reduce((s, r) => s + r.commissionCents, 0);
  const totalRevenue = globalAttributions.reduce((s, r) => s + r.order.grossCents, 0);
  const withRecentActivity = new Set(globalAttributions.map((row) => row.affiliateId)).size;
  const totalPages = Math.max(1, Math.ceil(activeCount / PAGE_SIZE));

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
          value={String(activeCount)}
          hint={`${withRecentActivity} with recent activity`}
        />
        <StatCard label="Commission owed" value={money(totalCommission)} hint="Across all attributed orders" />
        <StatCard label="Attributed revenue" value={money(totalRevenue)} hint="Driven by affiliate coupons" />
      </div>

      <form className="mb-6 flex max-w-xl gap-2" action="/affiliates">
        <input name="q" defaultValue={query} placeholder="Search name, email, or public code" className="min-w-0 flex-1 rounded-md border border-background-300 bg-background-50 px-3 py-2 text-sm" />
        <button className="rounded-md bg-foreground-900 px-4 py-2 text-sm text-background-50">Search</button>
        {query && <Link href="/affiliates" className="rounded-md border border-background-300 px-4 py-2 text-sm text-foreground-600">Clear</Link>}
      </form>

      {pendingApplications.length > 0 && (
        <Card className="p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">
            Pending applications <span className="text-foreground-500 font-normal">({pendingApplications.length})</span>
          </h2>
          <ul className="text-sm divide-y divide-background-100">
            {pendingApplications.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/affiliates/${a.id}`} className="text-foreground-800 truncate hover:text-primary-700 hover:underline">{a.name}</Link>
                  <div className="text-xs text-foreground-500 truncate">{a.email}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground-500">
                    {a.phone && <span><i className="ri-phone-line mr-1" />{a.phone}</span>}
                    {a.socialLink && (
                      <a href={a.socialLink} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                        <i className="ri-links-line mr-1" />Primary channel
                      </a>
                    )}
                    {a.referredBy && <span><i className="ri-user-shared-line mr-1" />Referred by {a.referredBy}</span>}
                    {a.country && <span><i className="ri-map-pin-line mr-1" />{a.country}</span>}
                  </div>
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
                  <Link href={`/affiliates/${affiliate.id}`} className="text-sm font-medium text-foreground-950 truncate hover:text-primary-700 hover:underline">{affiliate.name}</Link>
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
              <Link href={`/affiliates/${affiliate.id}`} className="mt-3 block rounded-md border border-background-300 px-3 py-2 text-center text-xs font-medium text-foreground-700 hover:bg-background-100">Open partner profile</Link>
            </Card>
          ))}
        </div>
      )}
      {totalPages > 1 && <div className="mt-6 flex items-center justify-between text-sm"><span className="text-foreground-500">Page {page} of {totalPages}</span><div className="flex gap-2">{page > 1 && <Link href={`/affiliates?page=${page - 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`} className="rounded-md border border-background-300 px-3 py-1.5">Previous</Link>}{page < totalPages && <Link href={`/affiliates?page=${page + 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`} className="rounded-md border border-background-300 px-3 py-1.5">Next</Link>}</div></div>}
    </div>
  );
}
