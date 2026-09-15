"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/email";

// Approving issues a personal, single-use 20%-off Coupon assigned to this
// requester's Contact record -- reuses the same Coupon model checkout
// already validates against (see coupon-engine.ts's assignedContact
// handling), so it auto-applies for them at checkout with no code to type,
// and resolveCoupons() rejects it for anyone else.
export async function approveHeroesDiscount(requestId: string) {
  const { organization } = await requireOrg();

  const request = await prisma.heroesDiscountRequest.findFirst({
    where: { id: requestId, organizationId: organization.id },
  });
  if (!request) throw new Error("Not found");
  if (request.reviewStatus !== "PENDING") throw new Error("Already reviewed");

  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: request.email } },
    update: {},
    create: { organizationId: organization.id, email: request.email, name: request.name },
  });

  const coupon = await prisma.coupon.create({
    data: {
      organizationId: organization.id,
      code: `HEROES-${request.id.slice(-8).toUpperCase()}`,
      description: `Heroes Discount -- ${request.name} (${request.status})`,
      type: "PERCENT",
      percentOff: 20,
      allowStacking: false,
      maxRedemptions: 1,
      assignedContactId: contact.id,
    },
  });

  await prisma.heroesDiscountRequest.update({
    where: { id: requestId },
    data: { reviewStatus: "APPROVED", reviewedAt: new Date(), couponId: coupon.id },
  });

  await sendTemplate(organization.id, "heroes_discount_approved", request.email, {
    name: request.name,
    couponCode: coupon.code,
  }).catch((err) => console.error("Heroes discount approval email failed", err));

  revalidatePath("/heroes-discount");
}

export async function rejectHeroesDiscount(requestId: string) {
  const { organization } = await requireOrg();

  const request = await prisma.heroesDiscountRequest.findFirst({
    where: { id: requestId, organizationId: organization.id },
  });
  if (!request) throw new Error("Not found");
  if (request.reviewStatus !== "PENDING") throw new Error("Already reviewed");

  await prisma.heroesDiscountRequest.update({
    where: { id: requestId },
    data: { reviewStatus: "REJECTED", reviewedAt: new Date() },
  });

  await sendTemplate(organization.id, "heroes_discount_rejected", request.email, {
    name: request.name,
  }).catch((err) => console.error("Heroes discount rejection email failed", err));

  revalidatePath("/heroes-discount");
}
