import { PrismaClient } from "@prisma/client";
import { computeProductProfit } from "../src/lib/order-profit";
import supplierCosts from "../prisma/evlv-supplier-costs.json";
import { AUD_PER_USD, toUsdCents } from "../src/lib/store-currency";

const SHEET = (supplierCosts as { costsCentsBySlug: Record<string, number> }).costsCentsBySlug;

// Recalculates the saved "Net profit (products)" on every existing EVLV
// order from what the order actually charged for products (after BOGO,
// coupons and the 5% P2P discount) minus the supplier sheet cost of each
// item, the card fee (card payments only) and the recorded affiliate
// commission. Costs come from prisma/evlv-supplier-costs.json through the
// product's store slug, so old product rows (older SKUs) get the sheet cost
// too; a product not on the sheet uses its CRM cost.
// It only rewrites Order.netProfitCents. Prices, totals, commissions,
// statuses and emails are not touched.
//
//   npm run db:recalc-profit                         -> preview only
//   npm run db:recalc-profit -- --apply              -> save
//   npm run db:recalc-profit -- --before=2026-11-18T15:00:00Z
//       only orders placed before that time (default: now)
//
// EVLV Australia (brand evlv-au) orders are in AUD: their cost is the AU
// store mapping's AUD cost (prisma/evlv-au-pricing.json, applied by
// db:prices:evlv-au), else the US cost converted at AUD_PER_USD. Totals
// below add AU orders in at USD.
//
// Run db:costs:evlv -- --apply first, so products not on the sheet and new
// orders use the same costs.

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const beforeArg = process.argv.find((a) => a.startsWith("--before="))?.slice("--before=".length);
const before = beforeArg ? new Date(beforeArg) : new Date();
if (Number.isNaN(before.getTime())) throw new Error(`Invalid --before date: ${beforeArg}`);
const PAID = new Set(["COMPLETED", "PROCESSING"]);
const money = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error("EVLV organization is missing");

  const products = await prisma.product.findMany({
    where: { organizationId: org.id },
    select: { id: true, sku: true, cogsCents: true, storeMappings: { select: { slug: true, brandId: true, cogsCents: true } } },
  });
  // Sheet cost through any store slug of the product, else the CRM cost.
  const unitCost = (p: (typeof products)[number]) => {
    for (const m of p.storeMappings) {
      if (m.slug && SHEET[m.slug] != null) return SHEET[m.slug];
    }
    return p.cogsCents;
  };
  const costById = new Map(products.map((p) => [p.id, unitCost(p)]));
  const costBySku = new Map(products.map((p) => [p.sku.toUpperCase(), unitCost(p)]));

  const auBrand = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: "evlv-au" } },
    select: { id: true },
  });
  // AUD cost per vial for AU orders.
  const auUnitCost = (p: (typeof products)[number]) => {
    const au = auBrand ? p.storeMappings.find((m) => m.brandId === auBrand.id && m.cogsCents != null) : undefined;
    return au ? (au.cogsCents as number) : Math.round(unitCost(p) * AUD_PER_USD);
  };
  const auCostById = new Map(products.map((p) => [p.id, auUnitCost(p)]));
  const auCostBySku = new Map(products.map((p) => [p.sku.toUpperCase(), auUnitCost(p)]));

  const orders = await prisma.order.findMany({
    where: { organizationId: org.id, placedAt: { lt: before } },
    orderBy: { placedAt: "asc" },
    select: {
      id: true,
      orderSeq: true,
      externalOrderNumber: true,
      placedAt: true,
      status: true,
      brandId: true,
      grossCents: true,
      paymentMethod: true,
      netProfitCents: true,
      items: { select: { quantity: true, productId: true, sku: true } },
      attribution: { select: { commissionCents: true } },
    },
  });

  const totals = {
    all: { old: 0, next: 0 },
    paid: { old: 0, next: 0, revenue: 0, cogs: 0, fees: 0, commission: 0, p2pDiscount: 0 },
  };
  const skipped: string[] = [];
  let changed = 0;

  console.log(`Orders placed before ${before.toISOString()}: ${orders.length}${apply ? "" : " (preview only)"}\n`);
  console.log("order      placed      status      paid by     old profit -> new profit");

  for (const order of orders) {
    let cogsCents = 0;
    let unknownCost = false;
    const isAu = auBrand != null && order.brandId === auBrand.id;
    const byId = isAu ? auCostById : costById;
    const bySku = isAu ? auCostBySku : costBySku;
    for (const item of order.items) {
      const unit = (item.productId ? byId.get(item.productId) : undefined) ?? bySku.get(item.sku.toUpperCase());
      if (unit == null) unknownCost = true;
      else cogsCents += unit * item.quantity;
    }
    const label = `#${order.orderSeq}`;
    if (unknownCost) {
      skipped.push(`${label} (${order.externalOrderNumber})`);
      continue;
    }

    const result = computeProductProfit({
      grossCents: order.grossCents,
      paymentMethod: order.paymentMethod,
      cogsCents,
      commissionCents: order.attribution?.commissionCents ?? 0,
    });
    const oldProfit = order.netProfitCents ?? 0;

    const usd = (cents: number) => toUsdCents(cents, isAu ? "AUD" : "USD");
    totals.all.old += usd(oldProfit);
    totals.all.next += usd(result.netProfitCents);
    if (PAID.has(order.status)) {
      totals.paid.old += usd(oldProfit);
      totals.paid.next += usd(result.netProfitCents);
      totals.paid.revenue += usd(result.productsPaidCents);
      totals.paid.cogs += usd(result.cogsCents);
      totals.paid.fees += usd(result.feeCents);
      totals.paid.commission += usd(result.commissionCents);
      totals.paid.p2pDiscount += usd(result.p2pDiscountCents);
    }

    if (order.netProfitCents === result.netProfitCents) continue;
    changed += 1;
    console.log(
      `${label.padEnd(10)} ${order.placedAt.toISOString().slice(0, 10)}  ${order.status.padEnd(11)} ${(order.paymentMethod || "-").padEnd(11)} ${money(oldProfit).padStart(10)} -> ${money(result.netProfitCents)}${isAu ? " AUD" : ""}`,
    );
    if (apply) {
      await prisma.order.update({ where: { id: order.id }, data: { netProfitCents: result.netProfitCents } });
    }
  }

  console.log(`\n${changed} order(s) ${apply ? "updated" : "would change"}.`);
  if (skipped.length) {
    console.log(`Skipped (an item has no matching product, profit left as is): ${skipped.join(", ")}`);
  }
  const p = totals.paid;
  console.log(`\nPaid orders (completed + processing), in USD${auBrand ? ` (AU orders converted at ${AUD_PER_USD} AUD per USD)` : ""}:`);
  console.log(`  Products paid   ${money(p.revenue)}   (after ${money(p.p2pDiscount)} P2P discount)`);
  console.log(`  Product cost    ${money(p.cogs)}`);
  console.log(`  Card fees       ${money(p.fees)}`);
  console.log(`  Commission      ${money(p.commission)}`);
  console.log(`  Net profit      ${money(p.old)} -> ${money(p.next)}`);
  console.log(`All orders net profit: ${money(totals.all.old)} -> ${money(totals.all.next)}`);
  if (!apply && changed) console.log("\nPreview only. Re-run with -- --apply to save.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
