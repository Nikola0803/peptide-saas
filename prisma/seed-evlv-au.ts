import { PrismaClient } from "@prisma/client";
import auPricing from "./evlv-au-pricing.json";

const prisma = new PrismaClient();

// AU prices and costs (AUD) come from prisma/evlv-au-pricing.json, the same
// file db:prices:evlv-au applies, so re-running this seed never brings back
// an older AU price list.
const AU_PRICES = Object.entries(
  (auPricing as { pricesBySlug: Record<string, { priceCents: number; cogsCents: number }> }).pricesBySlug,
).map(([slug, p]) => ({ slug, vialCents: p.priceCents, cogsCents: p.cogsCents }));

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
    const storePriceCents = price.vialCents;
    const source = await prisma.storeMapping.findUnique({
      where: { brandId_slug: { brandId: usBrand.id, slug: price.slug } },
    });
    if (!source) {
      console.warn(`Skipped ${price.slug}: no US catalog product for this slug yet.`);
      continue;
    }
    await prisma.storeMapping.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: price.slug } },
      update: {
        productId: source.productId,
        storePriceCents,
        retailCasePriceCents: null,
        cogsCents: price.cogsCents,
        active: true,
      },
      create: {
        brandId: brand.id,
        productId: source.productId,
        externalProductId: `au-${price.slug}`,
        slug: price.slug,
        storePriceCents,
        retailCasePriceCents: null,
        cogsCents: price.cogsCents,
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
