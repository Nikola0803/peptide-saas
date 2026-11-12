import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Exact-strength AUD prices verified from the live Australian comparison
// catalog on 2026-11-02. Each format is optional and no missing format is
// calculated from the other.
const AU_PRICES: Array<{ slug: string; vialCents?: number; case10Cents?: number }> = [
  { slug: "bpc-157-5mg", vialCents: 12000, case10Cents: 85000 },
  { slug: "bpc-157-10mg", vialCents: 18000, case10Cents: 125000 },
  { slug: "evlv-3-10mg", vialCents: 35000, case10Cents: 155000 },
  { slug: "evlv-3-20mg", vialCents: 50000, case10Cents: 215000 },
  { slug: "evlv-2-10mg", vialCents: 20000, case10Cents: 135000 },
  { slug: "evlv-1-5mg", vialCents: 20000 },
  { slug: "evlv-1-10mg", vialCents: 30000 },
  { slug: "mots-c-10mg", vialCents: 20000, case10Cents: 85000 },
  { slug: "tb-500-10mg", vialCents: 35000, case10Cents: 165000 },
  { slug: "tesamorelin-10mg", vialCents: 30000, case10Cents: 245000 },
  { slug: "ghk-cu-50mg", case10Cents: 85000 },
  { slug: "ghk-cu-100mg", case10Cents: 115000 },
  { slug: "selank-10mg", vialCents: 25000 },
  { slug: "semax-10mg", case10Cents: 105000 },
  { slug: "cjc-ipa-blend-10mg", case10Cents: 115000 },
  { slug: "aod-9604-5mg", case10Cents: 105000 },
  { slug: "aod-9604-10mg", case10Cents: 185000 },
  { slug: "dsip-10mg", case10Cents: 95000 },
  { slug: "epitalon-10mg", case10Cents: 75000 },
  { slug: "epitalon-50mg", case10Cents: 195000 },
  { slug: "nad-500mg", case10Cents: 95000 },
  { slug: "nad-1000mg", case10Cents: 125000 },
  { slug: "kpv-10mg", case10Cents: 105000 },
  { slug: "igf-1-lr3-1mg", case10Cents: 175000 },
  { slug: "ipamorelin-10mg", case10Cents: 105000 },
];

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
    const storePriceCents = price.vialCents ?? Math.round((price.case10Cents as number) / 10);
    const source = await prisma.storeMapping.findUnique({
      where: { brandId_slug: { brandId: usBrand.id, slug: price.slug } },
    });
    if (!source) throw new Error(`US catalog mapping missing for AU slug: ${price.slug}`);
    await prisma.storeMapping.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: price.slug } },
      update: {
        productId: source.productId,
        storePriceCents,
        retailCasePriceCents: price.case10Cents ?? null,
        active: true,
      },
      create: {
        brandId: brand.id,
        productId: source.productId,
        externalProductId: `au-${price.slug}`,
        slug: price.slug,
        storePriceCents,
        retailCasePriceCents: price.case10Cents ?? null,
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
  console.log(`Imported ${AU_PRICES.length} reviewed AU product-format prices.`);
}

main().finally(() => prisma.$disconnect());
