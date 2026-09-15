"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function updateContact(contactId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId: organization.id } });
  if (!contact) throw new Error("Not found");

  const name = String(formData.get("name") ?? "").trim();
  const marketingOptIn = formData.get("marketingOptIn") === "on";

  await prisma.contact.update({
    where: { id: contactId },
    data: { name: name || null, marketingOptIn },
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
}

/**
 * "Add an automated discount to this specific customer" -- a personal
 * coupon (Coupon.assignedContactId) that requires no code to be typed:
 * getAutoApplyCodes() in coupon-engine.ts picks it up automatically the
 * moment this contact checks out or is recognized as logged in (see
 * /api/store/coupons/validate and runCheckout()). Kept deliberately
 * simple -- fixed $ or % off, no BOGO/stacking knobs -- since this is a
 * one-off lifetime reward, not a campaign code.
 */
export async function assignPersonalCoupon(contactId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId: organization.id } });
  if (!contact) throw new Error("Not found");

  const type = String(formData.get("type") ?? "PERCENT") as "FIXED" | "PERCENT";
  const label = String(formData.get("label") ?? "").trim();

  // Suffixed with a short random token, not just the contact id, so
  // revoking a deal and assigning a new one to the same customer never
  // collides with the still-present (inactive) old row on the
  // (organizationId, code) unique constraint.
  const suffix = Date.now().toString(36).toUpperCase();
  const data: Record<string, unknown> = {
    organizationId: organization.id,
    code: `VIP-${contact.id.slice(-8).toUpperCase()}-${suffix}`,
    description: label || `Lifetime deal for ${contact.email}`,
    type,
    active: true,
    allowStacking: false,
    assignedContactId: contact.id,
  };

  if (type === "FIXED") {
    const dollars = Number(formData.get("fixedAmountDollars") ?? 0);
    if (!dollars || dollars <= 0) throw new Error("Enter a dollar amount off");
    data.fixedAmountCents = Math.round(dollars * 100);
  } else {
    const pct = Number(formData.get("percentOff") ?? 0);
    if (!pct || pct <= 0) throw new Error("Enter a percent off");
    data.percentOff = Math.round(pct);
  }

  await prisma.coupon.create({ data: data as any });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/coupons");
}

export async function revokePersonalCoupon(couponId: string) {
  const { organization } = await requireOrg();
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, organizationId: organization.id } });
  if (!coupon) throw new Error("Not found");
  await prisma.coupon.update({ where: { id: couponId }, data: { active: false } });
  if (coupon.assignedContactId) revalidatePath(`/contacts/${coupon.assignedContactId}`);
  revalidatePath("/coupons");
}
