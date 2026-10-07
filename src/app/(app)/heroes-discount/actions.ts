"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/email";

// Approval creates or upgrades one personal lifetime 25%-off Coupon on the
// requester's Contact. Checkout auto-applies it when the verified account
// or email is recognized, and resolveCoupons() rejects it for anyone else.
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

  const existingCoupon = await prisma.coupon.findFirst({
    where: {
      organizationId: organization.id,
      assignedContactId: contact.id,
      code: { startsWith: "HEROES-", mode: "insensitive" },
    },
  });

  const coupon = existingCoupon
    ? await prisma.coupon.update({
        where: { id: existingCoupon.id },
        data: {
          description: `25% Lifetime Service Discount -- ${request.name} (${request.status})`,
          type: "PERCENT",
          percentOff: 25,
          allowStacking: false,
          maxRedemptions: null,
          expiresAt: null,
          active: true,
        },
      })
    : await prisma.coupon.create({
        data: {
          organizationId: organization.id,
          code: `HEROES-${request.id.slice(-8).toUpperCase()}`,
          description: `25% Lifetime Service Discount -- ${request.name} (${request.status})`,
          type: "PERCENT",
          percentOff: 25,
          allowStacking: false,
          maxRedemptions: null,
          assignedContactId: contact.id,
        },
      });

  await prisma.heroesDiscountRequest.update({
    where: { id: requestId },
    data: {
      reviewStatus: "APPROVED",
      reviewedAt: new Date(),
      ...(existingCoupon ? {} : { couponId: coupon.id }),
    },
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
