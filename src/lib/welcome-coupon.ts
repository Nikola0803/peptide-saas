import { prisma } from "@/lib/prisma";

const WELCOME_PREFIXES = ["WELCOME20-", "WELCOME10-"] as const;

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
    const upgraded = await prisma.coupon.update({
      where: { id: existing.id },
      data: {
        description: `20% first-purchase welcome reward -- ${email}`,
        percentOff: 20,
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
      code: `WELCOME20-${contactId.slice(-8).toUpperCase()}`,
      description: `20% first-purchase welcome reward -- ${email}`,
      type: "PERCENT",
      percentOff: 20,
      allowStacking: true,
      maxRedemptions: 1,
      assignedContactId: contactId,
    },
    select: { code: true },
  });
  return coupon.code;
}
