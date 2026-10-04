import { prisma } from "@/lib/prisma";

const WELCOME_PREFIXES = ["WELCOME20-", "WELCOME10-"] as const;
const NEW_WELCOME_PERCENT = 10;

/** One personal, single-use reward shared by signup and account creation. */
export async function ensureWelcomeCoupon(organizationId: string, contactId: string, email: string) {
  const existing = await prisma.coupon.findFirst({
    where: {
      organizationId,
      assignedContactId: contactId,
      OR: WELCOME_PREFIXES.map((prefix) => ({ code: { startsWith: prefix } })),
    },
  });

  if (existing) {
    // Honor the value already issued to an existing customer. Only newly
    // created welcome rewards use the current 10% offer.
    const existingPercent = existing.percentOff
      ?? (existing.code.toUpperCase().startsWith("WELCOME20-") ? 20 : NEW_WELCOME_PERCENT);
    const upgraded = await prisma.coupon.update({
      where: { id: existing.id },
      data: {
        description: `${existingPercent}% first-purchase welcome reward -- ${email}`,
        percentOff: existingPercent,
        allowStacking: true,
        maxRedemptions: 1,
      },
      select: { code: true },
    });
    return upgraded.code;
  }

  const coupon = await prisma.coupon.create({
    data: {
      organizationId,
      code: `WELCOME10-${contactId.slice(-8).toUpperCase()}`,
      description: `10% first-purchase welcome reward -- ${email}`,
      type: "PERCENT",
      percentOff: NEW_WELCOME_PERCENT,
      allowStacking: true,
      maxRedemptions: 1,
      assignedContactId: contactId,
    },
    select: { code: true },
  });
  return coupon.code;
}
