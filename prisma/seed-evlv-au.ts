import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Exact-strength AUD prices verified from the live Australian comparison
// catalog on 2026-11-02. Rows are included only when both 1-vial and 10-pack
// prices were explicitly published; no missing strength is inferred.
const AU_PRICES = [
  { slug: "bpc-157-5mg", vialCents: 12000, case10Cents: 85000 },
  { slug: "bpc-157-10mg", vialCents: 18000, case10Cents: 125000 },
  { slug: "evlv-3-10mg", vialCents: 35000, case10Cents: 155000 },
  { slug: "evlv-2-10mg", vialCents: 20000, case10Cents: 135000 },
  { slug: "mots-c-10mg", vialCents: 20000, case10Cents: 85000 },
  { slug: "tb-500-10mg", vialCents: 35000, case10Cents: 165000 },
  { slug: "tesamorelin-10mg", vialCents: 30000, case10Cents: 245000 },
] as const;

async function main() {
  const organization = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!organization) throw new Error('EVLV organization is missing. Run "npm run db:seed:evlv" first.');

  const brand = await prisma.brand.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "evlv-au" } },
    update: { name: "EVLV Australia", domain: "evlvpeptides.com.au", supportEmail: "support@evlvpeptides.com.au", senderName: "EVLV Australia", status: "CONNECTED", verifiedAt: new Date() },
    create: { organizationId: organization.id, slug: "evlv-au", name: "EVLV Australia", domain: "evlvpeptides.com.au", supportEmail: "support@evlvpeptides.com.au", senderName: "EVLV Australia", status: "CONNECTED", verifiedAt: new Date(), lastSyncedAt: new Date() },
  });

  await prisma.trackingConfig.upsert({ where: { brandId: brand.id }, update: {}, create: { brandId: brand.id } });

  const usBrand = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: organization.id, slug: "evlv" } },
  });
  if (!usBrand) throw new Error('EVLV US brand is missing. Run "npm run db:seed:evlv" first.');

  await prisma.storeMapping.updateMany({
    where: { brandId: brand.id, slug: { notIn: AU_PRICES.map((item) => item.slug) } },
    data: { active: false },
  });

  for (const price of AU_PRICES) {
    const source = await prisma.storeMapping.findUnique({
      where: { brandId_slug: { brandId: usBrand.id, slug: price.slug } },
    });
    if (!source) throw new Error(`US catalog mapping missing for AU slug: ${price.slug}`);
    await prisma.storeMapping.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: price.slug } },
      update: {
        productId: source.productId,
        storePriceCents: price.vialCents,
        retailCasePriceCents: price.case10Cents,
        active: true,
      },
      create: {
        brandId: brand.id,
        productId: source.productId,
        externalProductId: `au-${price.slug}`,
        slug: price.slug,
        storePriceCents: price.vialCents,
        retailCasePriceCents: price.case10Cents,
        active: true,
      },
    });
  }

  const tracking = await prisma.trackingConfig.findUniqueOrThrow({ where: { brandId: brand.id } });
  console.log("EVLV Australia CRM brand ready.");
  console.log(`CRM_STORE_DOMAIN=${brand.domain}`);
  console.log(`CRM_ORG_API_KEY=${organization.apiKey}`);
  console.log(`CRM_CONTACT_FORM_KEY=${tracking.publicKey}`);
  console.log(`NEXT_PUBLIC_CRM_TRACKING_KEY=${tracking.publicKey}`);
  console.log(`Imported ${AU_PRICES.length} reviewed AU vial + 10-pack price pairs.`);
  console.log(`AU_CATALOG_SLUGS=${AU_PRICES.map((item) => item.slug).join(",")}`);
}

main().finally(() => prisma.$disconnect());
