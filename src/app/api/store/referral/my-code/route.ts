import { NextRequest, NextResponse } from "next/server";
import { bearerToken, verifyCustomerToken } from "@/lib/customer-auth";
import { ensureReferralCode } from "@/lib/referral-engine";
import { prisma } from "@/lib/prisma";

// GET /api/store/referral/my-code
// Authenticated endpoint — returns the logged-in customer's referral code
// and the count of successful referrals (referees who placed ≥1 order).
// The storefront uses this to render the "Share your link, earn $15" panel.
export async function GET(req: NextRequest) {
  const claims = verifyCustomerToken(bearerToken(req));
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const referralCode = await ensureReferralCode(claims.contactId);

  const successfulReferrals = await prisma.contact.count({
    where: {
      referredByContactId: claims.contactId,
      referralCreditIssuedAt: { not: null },
    },
  });

  return NextResponse.json({
    referralCode,
    successfulReferrals,
    referrerBonusCents: 1500,
    refereeBonusCents: 1500,
  });
}
