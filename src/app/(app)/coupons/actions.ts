"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function optionalCentsFromDollars(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw == null || String(raw).trim() === "") return undefined;
  const dollars = Number(raw);
  if (Number.isNaN(dollars)) return undefined;
  return Math.round(dollars * 100);
}

function optionalInt(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw == null || String(raw).trim() === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : Math.round(n);
}

function optionalString(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  const s = raw == null ? "" : String(raw).trim();
  return s === "" ? undefined : s;
}

export async function createCoupon(formData: FormData) {
  const { organization } = await requireOrg();

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const type = String(formData.get("type") ?? "").trim() as "FIXED" | "PERCENT" | "BOGO";
  if (!code) throw new Error("Coupon code is required");
  if (!["FIXED", "PERCENT", "BOGO"].includes(type)) throw new Error("Invalid coupon type");

  const description = optionalString(formData, "description");
  const allowStacking = formData.get("allowStacking") === "on";
  const minOrderCents = optionalCentsFromDollars(formData, "minOrderDollars");
  const maxRedemptions = optionalInt(formData, "maxRedemptions");
  const expiresAtRaw = optionalString(formData, "expiresAt");
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : undefined;

  const data: Record<string, unknown> = {
    organizationId: organization.id,
    code,
    description,
    type,
    allowStacking,
    minOrderCents,
    maxRedemptions,
    expiresAt,
  };

  if (type === "FIXED") {
    const cents = optionalCentsFromDollars(formData, "fixedAmountDollars");
    if (!cents) throw new Error("Fixed-amount coupons need a dollar amount off");
    data.fixedAmountCents = cents;
  }

  if (type === "PERCENT") {
    const pct = optionalInt(formData, "percentOff");
    if (!pct) throw new Error("Percent coupons need a percent-off value");
    data.percentOff = pct;
  }

  if (type === "BOGO") {
    const buyQty = optionalInt(formData, "bogoBuyQuantity");
    const getQty = optionalInt(formData, "bogoGetQuantity");
    const rewardType = String(formData.get("bogoRewardType") ?? "") as "FREE" | "PERCENT_OFF" | "FIXED_OFF";
    if (!buyQty || !getQty) throw new Error("BOGO coupons need both a buy quantity and a get quantity");
    if (!["FREE", "PERCENT_OFF", "FIXED_OFF"].includes(rewardType)) throw new Error("Invalid BOGO reward type");

    data.bogoBuyQuantity = buyQty;
    data.bogoGetQuantity = getQty;
    data.bogoRewardType = rewardType;
    data.bogoTriggerProductId = optionalString(formData, "bogoTriggerProductId");
    data.bogoRewardProductId = optionalString(formData, "bogoRewardProductId");

    if (rewardType === "PERCENT_OFF") {
      const pct = optionalInt(formData, "bogoRewardPercent");
      if (!pct) throw new Error("Set a reward percent-off for this BOGO coupon");
      data.bogoRewardPercent = pct;
    }
    if (rewardType === "FIXED_OFF") {
      const cents = optionalCentsFromDollars(formData, "bogoRewardFixedDollars");
      if (!cents) throw new Error("Set a reward dollar amount off for this BOGO coupon");
      data.bogoRewardFixedCents = cents;
    }
  }

  await prisma.coupon.create({ data: data as any });

  revalidatePath("/coupons");
  redirect("/coupons");
}

export async function toggleCouponActive(couponId: string) {
  const { organization } = await requireOrg();
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, organizationId: organization.id } });
  if (!coupon) throw new Error("Not found");
  await prisma.coupon.update({ where: { id: couponId }, data: { active: !coupon.active } });
  revalidatePath("/coupons");
}

export async function deleteCoupon(couponId: string) {
  const { organization } = await requireOrg();
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, organizationId: organization.id } });
  if (!coupon) throw new Error("Not found");
  await prisma.coupon.delete({ where: { id: couponId } });
  revalidatePath("/coupons");
}

export async function saveMinMarginPercent(formData: FormData) {
  const { organization } = await requireOrg();
  const pct = optionalInt(formData, "minMarginPercent");
  if (pct == null || pct < 0 || pct > 95) throw new Error("Minimum margin must be between 0 and 95 percent");
  await prisma.organization.update({ where: { id: organization.id }, data: { minMarginPercent: pct } });
  revalidatePath("/coupons");
}
