"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { sendTemplate } from "@/lib/email";
import { AFFILIATE_CODE_RE, normalizeAffiliateCode } from "@/lib/affiliate-program";
import { createId } from "@/lib/id";
import { getActiveBrand } from "@/lib/active-brand";

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

export async function createBlankAffiliateQr(formData: FormData) {
  const { organization } = await requireOrg();
  const label = String(formData.get("label") ?? "").trim();
  const ratePercent = Number(formData.get("ratePercent") ?? 0);
  const customerDiscountPercent = Number(formData.get("customerDiscountPercent") ?? 0);

  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 40) throw new Error("Rate must be between 0% and 40%");
  if (!Number.isInteger(customerDiscountPercent) || customerDiscountPercent < 0 || customerDiscountPercent > Math.min(30, Math.floor(ratePercent))) {
    throw new Error("Customer discount must be a whole number no greater than the total assigned rate or 30%");
  }

  const activeBrand = await getActiveBrand(organization.id);
  let couponCode = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `SHOP-${createId().slice(0, 8).toUpperCase()}`;
    const [affiliateCollision, couponCollision] = await Promise.all([
      prisma.affiliate.findFirst({ where: { organizationId: organization.id, couponCode: candidate }, select: { id: true } }),
      prisma.coupon.findFirst({ where: { organizationId: organization.id, code: candidate }, select: { id: true } }),
    ]);
    if (!affiliateCollision && !couponCollision) {
      couponCode = candidate;
      break;
    }
  }
  if (!couponCode) throw new Error("Could not generate a unique QR code");

  const affiliate = await prisma.affiliate.create({
    data: {
      organizationId: organization.id,
      sourceBrandId: activeBrand?.id,
      name: label ? `Unassigned QR · ${label}` : `Unassigned QR · ${couponCode}`,
      slug: `unassigned-${couponCode.toLowerCase()}`,
      couponCode,
      ratePercent,
      customerDiscountPercent,
      status: "APPROVED",
    },
  });

  revalidatePath("/affiliates");
  redirect(`/affiliates/${affiliate.id}`);
}

export async function assignAffiliateOwner(affiliateId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const socialLink = String(formData.get("socialLink") ?? "").trim() || null;

  if (!name) throw new Error("Owner or placement name is required");
  if (email) {
    const collision = await prisma.affiliate.findFirst({ where: { email, id: { not: affiliateId } }, select: { id: true } });
    if (collision) throw new Error("That email already belongs to another affiliate");
  }

  await prisma.affiliate.update({
    where: { id: affiliateId, organizationId: organization.id },
    data: { name, email, phone, socialLink },
  });
  revalidatePath("/affiliates");
  revalidatePath(`/affiliates/${affiliateId}`);
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
