import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { resolveContactFromToken } from "@/lib/store-customer";
import { getAffiliateStats, getAffiliateClickCounts } from "@/lib/affiliate-balance";
import { payoutMethodToWire, bankAccountTypeToWire } from "@/lib/affiliate-wire";

// POST /api/store/affiliate/dashboard { token }
// Resolves the Contact from the token, then looks up any linked Affiliate
// row. Always returns 200 with a `status` field ("NONE" | "PENDING" |
// "APPROVED") -- never a 404, that's not an error case, it just means
// this customer hasn't applied. See AFFILIATE-PORTAL.md.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const contact = await resolveContactFromToken(req, store, raw);
  if (!contact) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const affiliate = await prisma.affiliate.findUnique({ where: { contactId: contact.id } });
  if (!affiliate) {
    return NextResponse.json({ status: "NONE" });
  }
  if (affiliate.status !== "APPROVED") {
    return NextResponse.json({ status: affiliate.status });
  }

  const performanceStart = new Date();
  performanceStart.setUTCHours(0, 0, 0, 0);
  performanceStart.setUTCDate(performanceStart.getUTCDate() - 29);

  const [organization, stats, clicks, clickRows, attributions, payoutRequests] = await Promise.all([
    prisma.organization.findUnique({ where: { id: store.organizationId } }),
    getAffiliateStats(affiliate.id),
    getAffiliateClickCounts(affiliate.id),
    prisma.affiliateClick.findMany({
      where: { affiliateId: affiliate.id, createdAt: { gte: performanceStart } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.affiliateOrderAttribution.findMany({
      where: { affiliateId: affiliate.id },
      include: {
        order: {
          select: {
            orderSeq: true,
            status: true,
            grossCents: true,
            placedAt: true,
          },
        },
      },
    }),
    prisma.affiliatePayoutRequest.findMany({
      where: { affiliateId: affiliate.id },
      select: { id: true, amountCents: true, status: true, requestedAt: true, paidAt: true },
      orderBy: { requestedAt: "desc" },
    }),
  ]);

  const daily = new Map<string, { date: string; clicks: number; conversions: number; commissionCents: number }>();
  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date(performanceStart);
    date.setUTCDate(performanceStart.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    daily.set(key, { date: key, clicks: 0, conversions: 0, commissionCents: 0 });
  }
  for (const click of clickRows) {
    const key = click.createdAt.toISOString().slice(0, 10);
    const point = daily.get(key);
    if (point) point.clicks += 1;
  }
  for (const attribution of attributions) {
    const key = attribution.order.placedAt.toISOString().slice(0, 10);
    const point = daily.get(key);
    if (point) {
      point.conversions += 1;
      point.commissionCents += attribution.commissionCents;
    }
  }

  const confirmedAttributions = attributions.filter((item) => item.order.status === "COMPLETED");
  const grossRevenueCents = confirmedAttributions.reduce((sum, item) => sum + item.order.grossCents, 0);
  const lifetimeCommissionCents = confirmedAttributions.reduce((sum, item) => sum + item.commissionCents, 0);
  const paidCommissionCents = payoutRequests
    .filter((item) => item.status === "PAID")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const totalConversions = attributions.length;

  return NextResponse.json({
    status: "APPROVED",
    affiliateName: affiliate.name,
    affiliateEmail: affiliate.email,
    referralCode: affiliate.slug,
    ratePercent: affiliate.ratePercent,
    clicks30d: clicks.clicks30d,
    clicksTotal: clicks.clicksTotal,
    totalConversions,
    conversionRate: clicks.clicksTotal > 0 ? Number(((totalConversions / clicks.clicksTotal) * 100).toFixed(2)) : 0,
    salesConfirmed: stats.salesConfirmed,
    salesPending: stats.salesPending,
    grossRevenueCents,
    lifetimeCommissionCents,
    paidCommissionCents,
    commissionAvailableCents: stats.commissionAvailableCents,
    commissionPendingCents: stats.commissionPendingCents,
    performance: Array.from(daily.values()),
    recentConversions: attributions
      .sort((a, b) => b.order.placedAt.getTime() - a.order.placedAt.getTime())
      .slice(0, 25)
      .map((item) => ({
        orderNumber: item.order.orderSeq,
        placedAt: item.order.placedAt,
        orderStatus: item.order.status,
        grossCents: item.order.grossCents,
        commissionCents: item.commissionCents,
      })),
    payoutHistory: payoutRequests,
    minPayoutCents: organization?.affiliateMinPayoutCents ?? 5000,
    payoutMethod: payoutMethodToWire(affiliate.payoutMethod),
    payoutDestination: affiliate.payoutDestination,
    bankAccountHolder: affiliate.bankAccountHolder,
    bankRoutingNumber: affiliate.bankRoutingNumber,
    bankAccountNumber: affiliate.bankAccountNumber,
    bankAccountType: bankAccountTypeToWire(affiliate.bankAccountType),
  });
}
