"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { sendTemplate } from "@/lib/email";
import { AFFILIATE_CODE_RE, normalizeAffiliateCode } from "@/lib/affiliate-program";

export async function createAffiliate(formData: FormData) {
  const { organization } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const couponCode = normalizeAffiliateCode(String(formData.get("couponCode") ?? ""));
  const ratePercent = Number(formData.get("ratePercent") ?? 0);

  if (!name || !AFFILIATE_CODE_RE.test(couponCode)) throw new Error("Name and a valid 4-24 character code are required");
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 40) throw new Error("Rate must be between 0% and 40%");
  const collision = await prisma.coupon.findFirst({ where: { organizationId: organization.id, code: couponCode } });
  if (collision) throw new Error("That code is already used by a store coupon");

  await prisma.affiliate.create({
    data: {
      organizationId: organization.id,
      name,
      slug: slugify(name),
      couponCode,
      ratePercent,
      // Admin-created directly, so no self-serve review needed -- unlike
      // an applicant from /affiliates on the storefront (see
      // /api/store/affiliate/register), who starts PENDING.
      status: "APPROVED",
    },
  });

  revalidatePath("/affiliates");
  redirect("/affiliates");
}

export async function updateAffiliateProgram(affiliateId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const ratePercent = Number(formData.get("ratePercent"));
  const customerDiscountPercent = Number(formData.get("customerDiscountPercent"));
  const couponCode = normalizeAffiliateCode(String(formData.get("couponCode") ?? ""));
  const status = String(formData.get("status") ?? "APPROVED");

  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 40) throw new Error("Rate must be between 0% and 40%");
  if (!Number.isInteger(customerDiscountPercent) || customerDiscountPercent < 0 || customerDiscountPercent > Math.min(30, Math.floor(ratePercent))) {
    throw new Error("Customer discount must be a whole number no greater than the partner rate or 30%");
  }
  if (!AFFILIATE_CODE_RE.test(couponCode)) throw new Error("Use 4-24 letters, numbers, hyphens, or underscores for the code");
  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) throw new Error("Invalid status");

  const [affiliateCollision, couponCollision] = await Promise.all([
    prisma.affiliate.findFirst({ where: { organizationId: organization.id, couponCode, id: { not: affiliateId } }, select: { id: true } }),
    prisma.coupon.findFirst({ where: { organizationId: organization.id, code: couponCode }, select: { id: true } }),
  ]);
  if (affiliateCollision || couponCollision) throw new Error("That code is already in use");

  await prisma.affiliate.update({
    where: { id: affiliateId, organizationId: organization.id },
    data: { ratePercent, customerDiscountPercent, couponCode, status: status as "PENDING" | "APPROVED" | "REJECTED" },
  });
  revalidatePath("/affiliates");
  revalidatePath(`/affiliates/${affiliateId}`);
}

export async function approveAffiliate(affiliateId: string) {
  const { organization } = await requireOrg();
  const affiliate = await prisma.affiliate.update({
    where: { id: affiliateId, organizationId: organization.id },
    data: { status: "APPROVED" },
  });
  if (affiliate.email) {
    sendTemplate(organization.id, "affiliate_approved", affiliate.email, { affiliateName: affiliate.name }).catch((err) =>
      console.error("Affiliate approval email failed", err)
    );
  }
  revalidatePath("/affiliates");
}

export async function rejectAffiliate(affiliateId: string) {
  const { organization } = await requireOrg();
  const affiliate = await prisma.affiliate.update({
    where: { id: affiliateId, organizationId: organization.id },
    data: { status: "REJECTED" },
  });
  if (affiliate.email) {
    sendTemplate(organization.id, "affiliate_rejected", affiliate.email, { affiliateName: affiliate.name }).catch((err) =>
      console.error("Affiliate rejection email failed", err)
    );
  }
  revalidatePath("/affiliates");
}

export async function markPayoutPaid(payoutRequestId: string) {
  const { organization } = await requireOrg();
  const payout = await prisma.affiliatePayoutRequest.findFirst({
    where: { id: payoutRequestId, affiliate: { organizationId: organization.id } },
    include: { affiliate: true },
  });
  if (!payout) throw new Error("Not found");

  await prisma.affiliatePayoutRequest.update({
    where: { id: payoutRequestId },
    data: { status: "PAID", paidAt: new Date() },
  });

  if (payout.affiliate.email) {
    sendTemplate(organization.id, "affiliate_payout_paid", payout.affiliate.email, {
      affiliateName: payout.affiliate.name,
      amountFormatted: `$${(payout.amountCents / 100).toFixed(2)}`,
    }).catch((err) => console.error("Affiliate payout email failed", err));
  }

  revalidatePath("/affiliates");
}

export async function rejectPayout(payoutRequestId: string) {
  const { organization } = await requireOrg();
  const payout = await prisma.affiliatePayoutRequest.findFirst({
    where: { id: payoutRequestId, affiliate: { organizationId: organization.id } },
  });
  if (!payout) throw new Error("Not found");
  await prisma.affiliatePayoutRequest.update({ where: { id: payoutRequestId }, data: { status: "REJECTED" } });
  revalidatePath("/affiliates");
}
