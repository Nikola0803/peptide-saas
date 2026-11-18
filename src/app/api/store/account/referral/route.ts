import { NextRequest, NextResponse } from "next/server";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyCustomerToken } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_REFERRAL_REWARD_ENABLED, ensureReferralCode, REFERRAL_REWARD_CENTS } from "@/lib/customer-referral";

export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const claims = verifyCustomerToken(bearerToken(req) ?? (typeof body?.token === "string" ? body.token : null));
  if (!claims || claims.organizationId !== store.organizationId || claims.brandId !== store.brandId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const referralCode = await ensureReferralCode(claims.contactId);
  const referrals = await prisma.customerReferral.findMany({
    where: { organizationId: store.organizationId, brandId: store.brandId, referrerContactId: claims.contactId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, referredOrderId: true, qualifiedAt: true, rewardCouponCode: true },
  });
  const rewardCodes = referrals.map((item) => item.rewardCouponCode).filter((code): code is string => Boolean(code));
  const availableRewards = rewardCodes.length
    ? await prisma.coupon.count({
        where: {
          organizationId: store.organizationId,
          assignedContactId: claims.contactId,
          code: { in: rewardCodes },
          active: true,
          redemptionCount: { lt: 1 },
        },
      })
    : 0;

  return NextResponse.json({
    referralCode,
    referralLink: `https://www.evlvpeptides.com/?ref=${encodeURIComponent(referralCode)}`,
    friendRewardCents: CUSTOMER_REFERRAL_REWARD_ENABLED ? REFERRAL_REWARD_CENTS : 0,
    referrerRewardCents: CUSTOMER_REFERRAL_REWARD_ENABLED ? REFERRAL_REWARD_CENTS : 0,
    // Rewards already issued before the $15 program was switched off stay
    // redeemable; no new ones are created.
    availableStoreCreditCents: availableRewards * REFERRAL_REWARD_CENTS,
    referrals: referrals.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      status: item.qualifiedAt ? "REWARDED" : item.referredOrderId ? "ORDER_PENDING" : "SIGNED_UP",
      rewardCouponCode: item.rewardCouponCode,
    })),
  });
}
