import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyAffiliateToken } from "@/lib/affiliate-auth";
import { getAffiliateStats } from "@/lib/affiliate-balance";

// POST /api/store/affiliate/payout-request { token }
// Amount is never client-supplied -- resolved server-side from the
// affiliate's current available balance. This is a request, not an
// automatic transfer; a staff member pays out manually and marks it PAID
// from the CRM.
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

  const [affiliate, organization] = await Promise.all([
    prisma.affiliate.findUnique({ where: { id: claims.affiliateId } }),
    prisma.organization.findUnique({ where: { id: store.organizationId } }),
  ]);
  if (!affiliate || affiliate.status !== "APPROVED") {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }
  if (!affiliate.payoutMethod) {
    return NextResponse.json({ error: "Set a payout method before requesting a payout" }, { status: 400 });
  }

  const minPayoutCents = organization?.affiliateMinPayoutCents ?? 5000;
  const { commissionAvailableCents } = await getAffiliateStats(affiliate.id);
  if (commissionAvailableCents < minPayoutCents) {
    return NextResponse.json(
      { error: `Your available balance must be at least $${(minPayoutCents / 100).toFixed(2)} to request a payout` },
      { status: 400 }
    );
  }

  await prisma.affiliatePayoutRequest.create({
    data: { affiliateId: affiliate.id, amountCents: commissionAvailableCents },
  });

  return NextResponse.json({ amountCents: commissionAvailableCents });
}
