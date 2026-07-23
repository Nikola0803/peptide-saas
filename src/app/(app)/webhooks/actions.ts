"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function slugify(name: string): string {
  return "brand_" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Manual brand creation, for a site that isn't (or can't be) running the
 * WP plugin — status starts PENDING with a freshly generated webhook
 * secret, and the delivery URL/secret shown afterward can be pasted into
 * any webhook system that can sign with HMAC-SHA256, not just WooCommerce.
 */
export async function createBrand(formData: FormData) {
  const { organization } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  if (!name || !domain) throw new Error("Name and domain are both required");

  let slug = slugify(name);
  const existing = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: organization.id, slug } },
  });
  if (existing) slug = `${slug}_${Date.now().toString(36)}`;

  const brand = await prisma.brand.create({
    data: { organizationId: organization.id, name, domain, slug, status: "PENDING" },
  });

  await prisma.trackingConfig.create({ data: { brandId: brand.id } });

  revalidatePath("/webhooks");
  revalidatePath("/dashboard");
}

/** Removes a brand entirely — used for clearing out the seeded demo brands. */
export async function deleteBrand(brandId: string) {
  const { organization } = await requireOrg();
  await prisma.brand.delete({ where: { id: brandId, organizationId: organization.id } });
  revalidatePath("/webhooks");
  revalidatePath("/dashboard");
}
