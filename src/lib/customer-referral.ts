import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/email";

export const REFERRAL_REWARD_CENTS = 1500;

function codeStem(name: string | null, email: string) {
  const source = name?.split(/\s+/)[0] || email.split("@")[0] || "EVLV";
  return source.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase() || "EVLV";
}

function suffix() {
  return Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, "X");
}

export async function ensureReferralCode(contactId: string): Promise<string> {
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId }, select: { referralCode: true, name: true, email: true } });
  if (contact.referralCode) return contact.referralCode;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = `${codeStem(contact.name, contact.email)}-${suffix()}`;
    try {
      const updated = await prisma.contact.update({ where: { id: contactId }, data: { referralCode }, select: { referralCode: true } });
      return updated.referralCode!;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }
  }
  throw new Error("Could not generate a unique referral code");
}

export async function attachReferralAtRegistration(input: {
  organizationId: string;
  brandId: string;
  friendContactId: string;
  referralCode?: string;
}) {
  const code = input.referralCode?.trim();
  if (!code) return;
  const referrer = await prisma.contact.findFirst({
    where: { organizationId: input.organizationId, referralCode: { equals: code, mode: "insensitive" } },
    select: { id: true },
  });
  if (!referrer || referrer.id === input.friendContactId) return;
  await prisma.customerReferral.upsert({
    where: { friendContactId: input.friendContactId },
    update: {},
    create: { organizationId: input.organizationId, brandId: input.brandId, referrerContactId: referrer.id, friendContactId: input.friendContactId },
  });
}

export async function qualifyReferral(orderId: string): Promise<void> {
  const issued = await prisma.$transaction(async (tx) => {
    const referral = await tx.customerReferral.findUnique({
      where: { referredOrderId: orderId },
      include: { referrer: { select: { email: true, name: true } } },
    });
    if (!referral || referral.qualifiedAt || referral.rewardCouponCode) return null;

    // Claim the referral before creating its coupon. updateMany makes two
    // simultaneous status transitions idempotent; the loser creates no
    // second reward. A later failure rolls this claim back with the tx.
    const qualifiedAt = new Date();
    const claim = await tx.customerReferral.updateMany({
      where: { id: referral.id, qualifiedAt: null, rewardCouponCode: null },
      data: { qualifiedAt },
    });
    if (claim.count !== 1) return null;

    const rewardCouponCode = `THANKS15-${suffix()}${suffix()}`;
    await tx.coupon.create({
      data: {
        organizationId: referral.organizationId,
        code: rewardCouponCode,
        description: "Customer referral reward — $15 off one order",
        type: "FIXED",
        fixedAmountCents: REFERRAL_REWARD_CENTS,
        assignedContactId: referral.referrerContactId,
        maxRedemptions: 1,
        allowStacking: false,
      },
    });
    await tx.customerReferral.update({ where: { id: referral.id }, data: { rewardCouponCode } });
    return { ...referral, rewardCouponCode };
  });

  if (issued) {
    await sendTemplate(issued.organizationId, "referral_earned", issued.referrer.email, {
      customerName: issued.referrer.name || issued.referrer.email,
      rewardCode: issued.rewardCouponCode,
      rewardAmount: "$15",
    }, { brandId: issued.brandId }).catch((error) => console.error("Referral reward email failed", error));
  }
}
