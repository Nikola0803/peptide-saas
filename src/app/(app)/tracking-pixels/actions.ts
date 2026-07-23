"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function assertBrandOwnership(brandId: string) {
  const { organization } = await requireOrg();
  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: organization.id } });
  if (!brand) throw new Error("Brand not found");
  return brand;
}

export async function saveMetaConfig(formData: FormData) {
  const brandId = String(formData.get("brandId"));
  await assertBrandOwnership(brandId);

  await prisma.trackingConfig.update({
    where: { brandId },
    data: {
      metaPixelId: String(formData.get("metaPixelId") ?? "") || null,
      metaAccessToken: String(formData.get("metaAccessToken") ?? "") || null,
    },
  });
  revalidatePath("/tracking-pixels");
}

export async function saveTiktokConfig(formData: FormData) {
  const brandId = String(formData.get("brandId"));
  await assertBrandOwnership(brandId);

  await prisma.trackingConfig.update({
    where: { brandId },
    data: {
      tiktokPixelId: String(formData.get("tiktokPixelId") ?? "") || null,
      tiktokAccessToken: String(formData.get("tiktokAccessToken") ?? "") || null,
    },
  });
  revalidatePath("/tracking-pixels");
}

export async function saveGa4Config(formData: FormData) {
  const brandId = String(formData.get("brandId"));
  await assertBrandOwnership(brandId);

  await prisma.trackingConfig.update({
    where: { brandId },
    data: {
      ga4MeasurementId: String(formData.get("ga4MeasurementId") ?? "") || null,
      ga4ApiSecret: String(formData.get("ga4ApiSecret") ?? "") || null,
    },
  });
  revalidatePath("/tracking-pixels");
}
