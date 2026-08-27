import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyAffiliateToken } from "@/lib/affiliate-auth";
import { getAffiliateStats, getAffiliateClickCounts } from "@/lib/affiliate-balance";

// POST /api/store/affiliate/dashboard { token }
// Resolves the affiliate from the token server-side -- see
// AFFILIATE-PORTAL.md for the exact response shape the frontend depends on.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const claims = verifyAffiliateToken(bearerToken(req) ?? body?.token);
  if (!claims || claims.organizationId !== store.organizationId) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const affiliate = await prisma.affiliate.findUnique({ where: { id: claims.affiliateId } });
  if (!affiliate || affiliate.status !== "APPROVED") {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const organization = await prisma.organization.findUnique({ where: { id: store.organizationId } });
  const [stats, clicks] = await Promise.all([getAffiliateStats(affiliate.id), getAffiliateClickCounts(affiliate.id)]);

  return NextResponse.json({
    clicks30d: clicks.clicks30d,
    clicksTotal: clicks.clicksTotal,
    salesConfirmed: stats.salesConfirmed,
    salesPending: stats.salesPending,
    commissionAvailableCents: stats.commissionAvailableCents,
    commissionPendingCents: stats.commissionPendingCents,
    minPayoutCents: organization?.affiliateMinPayoutCents ?? 5000,
    payoutMethod: affiliate.payoutMethod,
    payoutDestination: affiliate.payoutDestination,
    bankAccountHolder: affiliate.bankAccountHolder,
    bankRoutingNumber: affiliate.bankRoutingNumber,
    bankAccountNumber: affiliate.bankAccountNumber,
    bankAccountType: affiliate.bankAccountType,
  });
}
