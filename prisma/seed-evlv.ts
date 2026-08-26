import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Real catalog, pulled directly from evlv-site's src/lib/products.ts (slug,
// sku, name, price) — the placeholder catalog this file used to have caused
// every real checkout to 422 with "Unknown or unpriced product" because none
// of its slugs matched what evlv-site actually sends. priceCents/slug/sku
// below are real; cogsCents/masterStock are still estimates (30% of price,
// 150 units) since real cost/inventory numbers weren't available here —
// correct those two columns once you have the real figures (safe to re-run
// this script any time, it's an upsert).
const PRODUCTS = [
  { slug: "bpc-157-10mg", sku: "BPC-10", chemicalName: "BPC-157 10MG", priceCents: 7000 },
  { slug: "gp-3-10mg", sku: "GP3-10", chemicalName: "GP-3 10MG", priceCents: 9000 },
  { slug: "tesamorelin-10mg", sku: "TESA-10", chemicalName: "TESAMORELIN 10MG", priceCents: 9000 },
  { slug: "ghk-cu-50mg", sku: "GHK-50", chemicalName: "GHK-CU 50MG", priceCents: 6500 },
  { slug: "mots-c-10mg", sku: "MOTS-10", chemicalName: "MOTS-C 10MG", priceCents: 7500 },
  { slug: "5-amino-1mq-50mg", sku: "5AM1MQ-50", chemicalName: "5-AMINO-1MQ 50MG", priceCents: 7000 },
  { slug: "thymosin-alpha-1-5mg", sku: "TA1-5", chemicalName: "THYMOSIN ALPHA-1 5MG", priceCents: 6000 },
  { slug: "wolverine-stack-20mg", sku: "WOLV-20", chemicalName: "WOLVERINE STACK 20MG", priceCents: 9500 },
  { slug: "glow-70mg", sku: "GLOW-70", chemicalName: "GLOW 70MG", priceCents: 11000 },
  { slug: "sermorelin-10mg", sku: "SERM-10", chemicalName: "SERMORELIN 10MG", priceCents: 6500 },
  { slug: "klow-80mg", sku: "KLOW-80", chemicalName: "KLOW 80MG", priceCents: 12500 },
  { slug: "selank-10mg", sku: "SEL-10", chemicalName: "SELANK 10MG", priceCents: 6000 },
  { slug: "cjc-1295-no-dac-5mg", sku: "CJC-5", chemicalName: "CJC-1295 WITHOUT DAC 5MG", priceCents: 7000 },
  // Required reconstitution add-on, auto-included by evlv-site's cart on
  // every order — see BAC_WATER in evlv-site's src/lib/cart-context.tsx,
  // whose comment points back at this exact file/slug.
  { slug: "bacteriostatic-water-30ml", sku: "BAC-WATER-30ML", chemicalName: "Bacteriostatic Water 30mL", priceCents: 1500 },
];

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "evlv" },
    update: {},
    create: { name: "EVLV", slug: "evlv", plan: "GROWTH" },
  });

  const brand = await prisma.brand.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "evlv" } },
    update: { domain: "evlvpeptides.com", status: "CONNECTED" },
    create: {
      organizationId: org.id,
      slug: "evlv",
      name: "EVLV",
      domain: "evlvpeptides.com",
      status: "CONNECTED",
      verifiedAt: new Date(),
    },
  });

  const passwordHash = await bcrypt.hash("password123", 10);
  const staffUser = await prisma.user.upsert({
    where: { email: "operator@evlvpeptides.com" },
    update: {},
    create: { email: "operator@evlvpeptides.com", name: "EVLV Operator", passwordHash },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: staffUser.id, organizationId: org.id } },
    update: {},
    create: { userId: staffUser.id, organizationId: org.id, role: "OWNER" },
  });

  // Deactivate any leftover mapping from the old placeholder catalog (e.g.
  // "bpc-157-5mg", "tb-500-5mg") that isn't a real evlv-site slug — left in
  // place (not deleted) since a placed order may already reference the
  // underlying Product row.
  const realSlugs = PRODUCTS.map((p) => p.slug);
  await prisma.storeMapping.updateMany({
    where: { brandId: brand.id, slug: { notIn: realSlugs } },
    data: { active: false },
  });

  for (const p of PRODUCTS) {
    const masterStock = 150;
    const cogsCents = Math.round(p.priceCents * 0.3);

    const product = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: p.sku } },
      update: { chemicalName: p.chemicalName, cogsCents },
      create: {
        organizationId: org.id,
        sku: p.sku,
        chemicalName: p.chemicalName,
        cogsCents,
        masterStock,
      },
    });

    await prisma.storeMapping.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: p.slug } },
      update: { storePriceCents: p.priceCents, active: true },
      create: {
        productId: product.id,
        brandId: brand.id,
        externalProductId: p.slug,
        slug: p.slug,
        storePriceCents: p.priceCents,
        active: true,
      },
    });

    await prisma.productLot.upsert({
      where: { productId_lotNumber: { productId: product.id, lotNumber: `LOT-${p.sku}-001` } },
      update: {},
      create: {
        productId: product.id,
        lotNumber: `LOT-${p.sku}-001`,
        quantityReceived: masterStock,
        quantityRemaining: masterStock,
      },
    });
  }

  console.log("EVLV seed complete.");
  console.log(`  Organization: ${org.name} (${org.id})`);
  console.log(`  Brand domain: ${brand.domain}`);
  console.log(`  CRM_ORG_API_KEY=${org.apiKey}`);
  console.log(`  CRM_STORE_DOMAIN=${brand.domain}`);
  console.log("  Staff login: operator@evlvpeptides.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
