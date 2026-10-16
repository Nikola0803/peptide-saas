import { prisma } from "@/lib/prisma";

const REFERRAL_BONUS_CENTS = 1500; // $15

function deriveReferralCode(contactId: string): string {
  return contactId.slice(-10).toUpperCase();
}

/** Get or create the referral code for a contact. */
export async function ensureReferralCode(contactId: string): Promise<string> {
  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  const code = deriveReferralCode(contactId);
  await prisma.contact.update({
    where: { id: contactId },
    data: { referralCode: code },
  });
  return code;
}

/**
 * Called at registration when a referral code is present in the request.
 * Links the referee to the referrer and issues them a $15 personal coupon.
 * Returns the coupon code (or null if the referral code is invalid/self-referral).
 */
export async function applyReferralSignup(
  organizationId: string,
  newContactId: string,
  referralCode: string
): Promise<string | null> {
  const referrer = await prisma.contact.findFirst({
    where: { organizationId, referralCode: referralCode.toUpperCase() },
    select: { id: true, name: true },
  });

  // Invalid code or self-referral
  if (!referrer || referrer.id === newContactId) return null;

  // Link the referee to the referrer
  await prisma.contact.update({
    where: { id: newContactId },
    data: { referredByContactId: referrer.id },
  });

  // Issue a $15 coupon assigned to the new contact
  const code = `REF15-${newContactId.slice(-8).toUpperCase()}`;
  await prisma.coupon.upsert({
    where: { organizationId_code: { organizationId, code } },
    update: {},
    create: {
      organizationId,
      code,
      description: `$15 referral welcome reward`,
      type: "FIXED",
      fixedAmountCents: REFERRAL_BONUS_CENTS,
      allowStacking: true,
      maxRedemptions: 1,
      assignedContactId: newContactId,
    },
  });

  return code;
}

/**
 * Called after a referred contact's FIRST order is placed.
 * Issues a $15 coupon to the referrer. Idempotent via referralCreditIssuedAt.
 */
export async function issueReferrerCredit(
  organizationId: string,
  refereeContactId: string
): Promise<void> {
  const referee = await prisma.contact.findUnique({
    where: { id: refereeContactId },
    select: { referredByContactId: true, referralCreditIssuedAt: true },
  });

  if (!referee?.referredByContactId || referee.referralCreditIssuedAt) return;

  const referrerId = referee.referredByContactId;

  // Mark credit as issued before creating the coupon to prevent races
  await prisma.contact.update({
    where: { id: refereeContactId },
    data: { referralCreditIssuedAt: new Date() },
  });

  const code = `REFBONUS15-${referrerId.slice(-8).toUpperCase()}`;
  // Use upsert so a referrer who has referred multiple people gets the
  // later ones ignored gracefully (one bonus per referral pair is the intent,
  // but the coupon code is stable so a second referee doesn't overwrite it).
  const existing = await prisma.coupon.findUnique({
    where: { organizationId_code: { organizationId, code } },
    select: { id: true, maxRedemptions: true },
  });

  if (existing) {
    // Bump max redemptions so each successful referral adds one more use
    await prisma.coupon.update({
      where: { id: existing.id },
      data: { maxRedemptions: { increment: 1 } },
    });
  } else {
    await prisma.coupon.create({
      data: {
        organizationId,
        code,
        description: `$15 referral bonus reward`,
        type: "FIXED",
        fixedAmountCents: REFERRAL_BONUS_CENTS,
        allowStacking: true,
        maxRedemptions: 1,
        assignedContactId: referrerId,
      },
    });
  }
}
