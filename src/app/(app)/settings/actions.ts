"use server";

import { revalidatePath } from "next/cache";
import { createId } from "@/lib/id";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function regenerateApiKey() {
  const { organization } = await requireOrg();

  await prisma.organization.update({
    where: { id: organization.id },
    data: { apiKey: createId() },
  });

  revalidatePath("/settings");
  revalidatePath("/webhooks");
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function updateBrandProfile(formData: FormData) {
  const { organization } = await requireOrg();
  const brandId = str(formData, "brandId");
  if (!brandId) return;

  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: organization.id } });
  if (!brand) return;

  await prisma.brand.update({
    where: { id: brandId },
    data: {
      logoUrl: str(formData, "logoUrl"),
      supportEmail: str(formData, "supportEmail"),
      senderName: str(formData, "senderName"),
      emailAccentColor: str(formData, "emailAccentColor"),
      businessAddress: str(formData, "businessAddress"),
    },
  });

  revalidatePath("/settings");
}
