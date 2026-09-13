"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { utcDateString } from "@/lib/order-engine";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Sets or replaces the Deal of the Day: exactly one StoreMapping per brand
// carries a dealDate at a time (a second call here just moves it) so
// there's never ambiguity about which single product the storefront's
// countdown card is pointing at. dealPriceCents is the REAL price
// checkout will charge starting the moment this saves -- see
// order-engine.ts's runCheckout and the dealDate doc comment in
// schema.prisma.
export async function setDealOfTheDay(brandId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: organization.id } });
  if (!brand) throw new Error("Brand not found");

  const storeMappingId = str(formData, "storeMappingId");
  const priceStr = str(formData, "dealPrice");
  const date = str(formData, "dealDate") || utcDateString();
  if (!storeMappingId) throw new Error("Choose a product");
  const price = Number(priceStr);
  if (!(price > 0)) throw new Error("Deal price must be greater than zero");

  const mapping = await prisma.storeMapping.findFirst({ where: { id: storeMappingId, brandId } });
  if (!mapping) throw new Error("Product not found on this brand");

  // Clear any other mapping currently holding this date/brand's deal slot
  // first, so only one product is ever "today's deal" at once.
  await prisma.storeMapping.updateMany({
    where: { brandId, dealDate: date, NOT: { id: mapping.id } },
    data: { dealDate: null, dealPriceCents: null },
  });

  await prisma.storeMapping.update({
    where: { id: mapping.id },
    data: { dealDate: date, dealPriceCents: Math.round(price * 100) },
  });

  revalidatePath("/promotions");
}

export async function clearDealOfTheDay(storeMappingId: string) {
  const { organization } = await requireOrg();
  const mapping = await prisma.storeMapping.findFirst({
    where: { id: storeMappingId, brand: { organizationId: organization.id } },
  });
  if (!mapping) throw new Error("Not found");

  await prisma.storeMapping.update({ where: { id: mapping.id }, data: { dealDate: null, dealPriceCents: null } });
  revalidatePath("/promotions");
}

export async function saveGiveawayConfig(brandId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: organization.id } });
  if (!brand) throw new Error("Brand not found");

  const enabled = formData.get("enabled") === "on";
  const prizeLabel = str(formData, "prizeLabel") ?? "";
  const minOrderStr = str(formData, "minOrder");
  const minOrderCents = minOrderStr ? Math.round(Number(minOrderStr) * 100) : 5000;
  const rulesText = str(formData, "rulesText");

  await prisma.giveawayConfig.upsert({
    where: { brandId },
    update: { enabled, prizeLabel, minOrderCents, rulesText },
    create: { brandId, enabled, prizeLabel, minOrderCents, rulesText },
  });

  revalidatePath("/promotions");
}
