import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  ["bpc-157-5mg", "BPC-5", "K9 Reforge 5MG", 3999, "99.31%", "k9-reforge.png"],
  ["bpc-157-10mg", "BPC-10", "K9 Reforge 10MG", 4999, "99.42%", "k9-reforge.png"],
  ["bpc-157-20mg", "BPC-20", "K9 Reforge 20MG", 8999, "99.9%", "k9-reforge.png"],
  ["tb-500-5mg", "TB-5", "K9 Reload 5MG", 4499, "99.59%", "k9-reload.png"],
  ["tb-500-10mg", "TB-10", "K9 Reload 10MG", 6999, "99.38%", "k9-reload.png"],
  ["tb-500-20mg", "TB-20", "K9 Reload 20MG", 12999, "99.1%", "k9-reload.png"],
  ["bpc-tb-500-blend-10mg", "BB-10", "K9 Rebuild 10MG", 7499, "99.31% / 99.59%", "k9-rebuild.png"],
  ["bpc-tb-500-blend-20mg", "BB-20", "K9 Rebuild 20MG", 10999, "99.68% / 99.55%", "k9-rebuild.png"],
  ["ghk-cu-50mg", "GHK-50", "K9 Restore 50MG", 3999, "99.4%", "k9-restore.png"],
  ["kpv-10mg", "KPV-10", "K9 Reclaim 10MG", 6999, "99.45%", "k9-reclaim.png"],
  ["kpv-oral-500mcg", "KPVO-500", "K9 Reclaim Oral 500MCG", 4999, "99.0%", "k9-reclaim.png"],
  ["glow-70mg", "GW-70", "K9 Recast 70MG", 13999, "99.32% / 99.28% / 99.56%", "k9-recast.png"],
] as const;

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error("Run db:seed:evlv first so ZOONETICS can join the existing EVLV organization.");

  const brand = await prisma.brand.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "zoonetics" } },
    update: {
      name: "ZOONETICS",
      domain: "zoonetics.co",
      status: "CONNECTED",
      supportEmail: "hello@zoonetics.co",
      senderName: "ZOONETICS",
      emailAccentColor: "#4C7EF3",
    },
    create: {
      organizationId: org.id,
      slug: "zoonetics",
      name: "ZOONETICS",
      domain: "zoonetics.co",
      status: "CONNECTED",
      verifiedAt: new Date(),
      logoUrl: "https://zoonetics.co/brand/zoonetics-dark.webp",
      supportEmail: "hello@zoonetics.co",
      senderName: "ZOONETICS",
      emailAccentColor: "#4C7EF3",
    },
  });

  for (const [slug, sku, name, priceCents, purity, image] of products) {
    const product = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku } },
      update: {},
      create: {
        organizationId: org.id,
        sku,
        chemicalName: name,
        cogsCents: Math.round(priceCents * 0.3),
        masterStock: 0,
        retailPriceCents: priceCents,
        imageUrl: `https://zoonetics.co/images/zoonetics-products/${image}`,
        shortDescription: "Canine peptide profile, independently tested for identity and purity.",
        description: `${name}, supplied as a research-use peptide profile with lot-level analytical documentation.`,
        purity,
        categoryLabel: "K9 Research Peptides",
        storageInstructions: "Store lyophilized vials refrigerated at 2 to 8°C and protect from light.",
        reconstitutionInstructions: "Use only the sterile saline supplied for the documented research workflow.",
      },
    });

    await prisma.storeMapping.upsert({
      where: { brandId_slug: { brandId: brand.id, slug } },
      update: { productId: product.id, storePriceCents: priceCents, active: true },
      create: {
        brandId: brand.id,
        productId: product.id,
        externalProductId: slug,
        slug,
        storePriceCents: priceCents,
        active: true,
      },
    });
  }

  const tracking = await prisma.trackingConfig.upsert({
    where: { brandId: brand.id },
    update: {},
    create: { brandId: brand.id },
  });

  console.log("ZOONETICS brand workspace seeded.");
  console.log(`CRM_STORE_DOMAIN=${brand.domain}`);
  console.log(`CRM_CONTACT_FORM_KEY=${tracking.publicKey}`);
  console.log(`CRM_BOOKING_FORM_KEY=${brand.bookingPublicKey}`);
  console.log(`Use the existing organization API key: ${org.apiKey}`);
}

main().finally(() => prisma.$disconnect());
