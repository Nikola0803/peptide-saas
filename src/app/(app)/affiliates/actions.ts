"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { sendTemplate } from "@/lib/email";

export async function createAffiliate(formData: FormData) {
  const { organization } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const couponCode = String(formData.get("couponCode") ?? "").trim().toUpperCase();
  const ratePercent = Number(formData.get("ratePercent") ?? 0);

  if (!name || !couponCode) throw new Error("Name and coupon code are both required");

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
  await prisma.affiliate.update({
    where: { id: affiliateId, organizationId: organization.id },
    data: { status: "REJECTED" },
  });
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
