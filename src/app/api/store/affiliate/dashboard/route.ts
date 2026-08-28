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

  const organization = await prisma.organization.findUnique({ where: { id: store.organizationId } });
  const [stats, clicks] = await Promise.all([getAffiliateStats(affiliate.id), getAffiliateClickCounts(affiliate.id)]);

  return NextResponse.json({
    status: "APPROVED",
    referralCode: affiliate.slug,
    clicks30d: clicks.clicks30d,
    clicksTotal: clicks.clicksTotal,
    salesConfirmed: stats.salesConfirmed,
    salesPending: stats.salesPending,
    commissionAvailableCents: stats.commissionAvailableCents,
    commissionPendingCents: stats.commissionPendingCents,
    minPayoutCents: organization?.affiliateMinPayoutCents ?? 5000,
    payoutMethod: payoutMethodToWire(affiliate.payoutMethod),
    payoutDestination: affiliate.payoutDestination,
    bankAccountHolder: affiliate.bankAccountHolder,
    bankRoutingNumber: affiliate.bankRoutingNumber,
    bankAccountNumber: affiliate.bankAccountNumber,
    bankAccountType: bankAccountTypeToWire(affiliate.bankAccountType),
  });
}
