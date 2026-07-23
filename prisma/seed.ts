import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo Peptide Network", slug: "demo", plan: "GROWTH" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.upsert({
    where: { email: "operator@example.com" },
    update: {},
    create: { email: "operator@example.com", name: "Operator", passwordHash },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: {},
    create: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });

  const [alpha, beta, gamma] = await Promise.all(
    [
      { slug: "brand_alpha", name: "Alpha Research", domain: "alpharesearch.co" },
      { slug: "brand_beta", name: "Beta Peptides", domain: "betapeptides.com" },
      { slug: "brand_gamma", name: "Gamma Labs", domain: "gammalabs.io" },
    ].map((b) =>
      prisma.brand.upsert({
        where: { organizationId_slug: { organizationId: org.id, slug: b.slug } },
        update: {},
        create: { ...b, organizationId: org.id, status: "CONNECTED", lastSyncedAt: new Date() },
      })
    )
  );

  const productDefs = [
    { sku: "BPC-157-5MG", chemicalName: "BPC-157 5mg", cogsCents: 1840, masterStock: 214, brands: [alpha, beta, gamma] },
    { sku: "TB-500-10MG", chemicalName: "TB-500 10mg", cogsCents: 2610, masterStock: 132, brands: [alpha, beta] },
    { sku: "IPAM-2MG", chemicalName: "Ipamorelin 2mg", cogsCents: 1420, masterStock: 0, brands: [beta, gamma] },
    { sku: "CJC-1295-5MG", chemicalName: "CJC-1295 (no DAC) 5mg", cogsCents: 2020, masterStock: 88, brands: [alpha, gamma] },
    { sku: "SEMA-5MG", chemicalName: "Semaglutide 5mg", cogsCents: 3890, masterStock: 46, brands: [gamma] },
  ];

  const products = [];
  for (const def of productDefs) {
    const product = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: def.sku } },
      update: {},
      create: {
        organizationId: org.id,
        sku: def.sku,
        chemicalName: def.chemicalName,
        cogsCents: def.cogsCents,
        masterStock: def.masterStock,
      },
    });
    products.push(product);

    for (const brand of def.brands) {
      await prisma.storeMapping.upsert({
        where: { brandId_externalProductId: { brandId: brand.id, externalProductId: `${brand.slug}-${def.sku}` } },
        update: {},
        create: {
          productId: product.id,
          brandId: brand.id,
          externalProductId: `${brand.slug}-${def.sku}`,
        },
      });
    }

    if (def.sku !== "IPAM-2MG") {
      await prisma.coaDocument.create({
        data: { productId: product.id, url: `https://example.com/coa/${def.sku}.pdf`, label: "Lot 001" },
      });
    }
  }

  const affiliateDefs = [
    { name: "Atlas Fitness Blog", slug: "a-atlas", ratePercent: 20, couponCode: "ATLAS20" },
    { name: "Dr. Steele", slug: "a-doc-steele", ratePercent: 18, couponCode: "MDPEP" },
    { name: "Biohacker Daily", slug: "a-biohacker", ratePercent: 14, couponCode: "BIOHACK" },
  ];
  const affiliates = [];
  for (const def of affiliateDefs) {
    const affiliate = await prisma.affiliate.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: def.slug } },
      update: {},
      create: { ...def, organizationId: org.id },
    });
    affiliates.push(affiliate);
  }

  const contactDefs = [
    { email: "marcus.reeve@protonmail.com", brand: alpha },
    { email: "julia.torres@fastmail.com", brand: beta },
    { email: "d.almeida@icloud.com", brand: gamma },
  ];

  const orderSeeds = [
    { number: "10241", brand: alpha, email: "marcus.reeve@protonmail.com", status: "COMPLETED" as const, gross: 12899, coupon: "ATLAS20", sku: "BPC-157-5MG", qty: 2 },
    { number: "44120", brand: beta, email: "julia.torres@fastmail.com", status: "PROCESSING" as const, gross: 26400, coupon: null, sku: "TB-500-10MG", qty: 1 },
    { number: "88901", brand: gamma, email: "d.almeida@icloud.com", status: "COMPLETED" as const, gross: 4750, coupon: null, sku: "IPAM-2MG", qty: 1 },
    { number: "10255", brand: alpha, email: "marcus.reeve@protonmail.com", status: "COMPLETED" as const, gross: 17900, coupon: "ATLAS20", sku: "CJC-1295-5MG", qty: 1 },
    { number: "44133", brand: beta, email: "julia.torres@fastmail.com", status: "ON_HOLD" as const, gross: 12900, coupon: "MDPEP", sku: "BPC-157-5MG", qty: 1 },
    { number: "88910", brand: gamma, email: "d.almeida@icloud.com", status: "REFUNDED" as const, gross: 38900, coupon: "BIOHACK", sku: "SEMA-5MG", qty: 1 },
  ];

  for (const { brand, email } of contactDefs) {
    const contact = await prisma.contact.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: {},
      create: { organizationId: org.id, email },
    });
    await prisma.contactBrandLink.upsert({
      where: { contactId_brandId: { contactId: contact.id, brandId: brand.id } },
      update: {},
      create: { contactId: contact.id, brandId: brand.id },
    });
  }

  let daysAgo = 0;
  for (const seed of orderSeeds) {
    const contact = await prisma.contact.findUniqueOrThrow({
      where: { organizationId_email: { organizationId: org.id, email: seed.email } },
    });
    const product = products.find((p) => p.sku === seed.sku)!;
    const affiliate = seed.coupon ? affiliates.find((a) => a.couponCode === seed.coupon) : undefined;

    const merchantFee = Math.round(seed.gross * 0.029) + 30;
    const commission = affiliate ? Math.round((seed.gross * affiliate.ratePercent) / 100) : 0;
    const cogs = product.cogsCents * seed.qty;
    const netProfit = seed.gross - merchantFee - commission - cogs;

    const placedAt = new Date();
    placedAt.setHours(placedAt.getHours() - daysAgo * 5);
    daysAgo += 1;

    const order = await prisma.order.upsert({
      where: { brandId_externalOrderNumber: { brandId: seed.brand.id, externalOrderNumber: seed.number } },
      update: {},
      create: {
        organizationId: org.id,
        brandId: seed.brand.id,
        contactId: contact.id,
        externalOrderNumber: seed.number,
        status: seed.status,
        couponCode: seed.coupon,
        grossCents: seed.gross,
        netProfitCents: netProfit,
        placedAt,
        shipToName: contact.email.split("@")[0].replace(".", " "),
        shipToAddress1: "123 Example St",
        shipToCity: "Austin",
        shipToState: "TX",
        shipToPostalCode: "78701",
        shipToCountry: "US",
      },
    });

    const existingItems = await prisma.orderItem.count({ where: { orderId: order.id } });
    if (existingItems === 0) {
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          sku: product.sku,
          name: product.chemicalName,
          quantity: seed.qty,
          unitPriceCents: Math.round(seed.gross / seed.qty),
        },
      });
    }

    if (affiliate) {
      await prisma.affiliateOrderAttribution.upsert({
        where: { orderId: order.id },
        update: {},
        create: { orderId: order.id, affiliateId: affiliate.id, commissionCents: commission },
      });
    }
  }

  for (const brand of [alpha, beta, gamma]) {
    const config = await prisma.trackingConfig.upsert({
      where: { brandId: brand.id },
      update: {},
      create: { brandId: brand.id },
    });

    const funnel: { event: string; count: number }[] = [
      { event: "page_view", count: 40 },
      { event: "view_content", count: 22 },
      { event: "add_to_cart", count: 9 },
      { event: "purchase", count: 3 },
    ];

    for (const step of funnel) {
      for (let i = 0; i < step.count; i++) {
        await prisma.trackingEvent.create({
          data: {
            organizationId: org.id,
            brandId: brand.id,
            eventName: step.event,
            visitorId: `demo-visitor-${brand.slug}-${i}`,
            valueCents: step.event === "purchase" ? 12900 : null,
            currency: step.event === "purchase" ? "USD" : null,
            pageUrl: `https://${brand.domain}/`,
            relayedMeta: false,
            relayedTiktok: false,
            relayedGa4: false,
          },
        });
      }
    }
    void config;
  }

  console.log("Seed complete. Sign in with operator@example.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
