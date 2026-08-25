import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Placeholder catalog — 13 SKUs + Bacteriostatic Water, matching the count
// in the handoff brief. The `slug` on each is what evlv-site's checkout
// must send in /api/store/checkout's items[].slug — swap these for the
// real slugs from evlv-site's static catalog before going live, and
// double-check priceCents/cogsCents/masterStock against the real numbers.
const PRODUCTS = [
  { slug: "bpc-157-5mg", sku: "BPC-157-5MG", chemicalName: "BPC-157 5mg", priceCents: 6900, cogsCents: 1840, masterStock: 100 },
  { slug: "bpc-157-10mg", sku: "BPC-157-10MG", chemicalName: "BPC-157 10mg", priceCents: 11900, cogsCents: 3200, masterStock: 100 },
  { slug: "tb-500-5mg", sku: "TB-500-5MG", chemicalName: "TB-500 5mg", priceCents: 8900, cogsCents: 2100, masterStock: 100 },
  { slug: "tb-500-10mg", sku: "TB-500-10MG", chemicalName: "TB-500 10mg", priceCents: 14900, cogsCents: 3900, masterStock: 100 },
  { slug: "ipamorelin-5mg", sku: "IPAM-5MG", chemicalName: "Ipamorelin 5mg", priceCents: 5900, cogsCents: 1500, masterStock: 100 },
  { slug: "cjc-1295-no-dac-5mg", sku: "CJC-1295-NODAC-5MG", chemicalName: "CJC-1295 (no DAC) 5mg", priceCents: 7900, cogsCents: 2020, masterStock: 100 },
  { slug: "cjc-1295-ipamorelin-blend", sku: "CJC-IPAM-BLEND", chemicalName: "CJC-1295 / Ipamorelin Blend", priceCents: 9900, cogsCents: 2600, masterStock: 100 },
  { slug: "semaglutide-5mg", sku: "SEMA-5MG", chemicalName: "Semaglutide 5mg", priceCents: 18900, cogsCents: 3890, masterStock: 60 },
  { slug: "tirzepatide-10mg", sku: "TIRZ-10MG", chemicalName: "Tirzepatide 10mg", priceCents: 24900, cogsCents: 5200, masterStock: 60 },
  { slug: "aod-9604-5mg", sku: "AOD-9604-5MG", chemicalName: "AOD-9604 5mg", priceCents: 8900, cogsCents: 2300, masterStock: 80 },
  { slug: "melanotan-2-10mg", sku: "MT2-10MG", chemicalName: "Melanotan II 10mg", priceCents: 4900, cogsCents: 1100, masterStock: 80 },
  { slug: "pt-141-10mg", sku: "PT141-10MG", chemicalName: "PT-141 10mg", priceCents: 6900, cogsCents: 1700, masterStock: 80 },
  { slug: "ghk-cu-50mg", sku: "GHK-CU-50MG", chemicalName: "GHK-Cu 50mg", priceCents: 5900, cogsCents: 1400, masterStock: 80 },
  { slug: "bacteriostatic-water-30ml", sku: "BAC-WATER-30ML", chemicalName: "Bacteriostatic Water 30mL", priceCents: 1500, cogsCents: 300, masterStock: 300 },
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

  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: p.sku } },
      update: { chemicalName: p.chemicalName, cogsCents: p.cogsCents, masterStock: p.masterStock },
      create: {
        organizationId: org.id,
        sku: p.sku,
        chemicalName: p.chemicalName,
        cogsCents: p.cogsCents,
        masterStock: p.masterStock,
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
        quantityReceived: p.masterStock,
        quantityRemaining: p.masterStock,
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
