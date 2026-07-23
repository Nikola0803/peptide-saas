"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

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
    },
  });

  revalidatePath("/affiliates");
  redirect("/affiliates");
}
