import { PrismaClient } from "@prisma/client";
import { computeProductProfit } from "../src/lib/order-profit";

// Recalculates the saved "Net profit (products)" on existing EVLV orders
// using today's product costs (the supplier sheet costs from
// npm run db:costs:evlv), no card fee on P2P orders and the 5% P2P discount.
// It only rewrites Order.netProfitCents. Prices, totals, commissions,
// statuses and emails are not touched.
//
//   npm run db:recalc-profit                         -> preview only
//   npm run db:recalc-profit -- --apply              -> save
//   npm run db:recalc-profit -- --before=2026-11-18T15:00:00Z
//       only orders placed before that time (default: now)
//
// Run db:costs:evlv -- --apply first, so the costs are the real ones.

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
    select: { id: true, sku: true, cogsCents: true },
  });
  const costById = new Map(products.map((p) => [p.id, p.cogsCents]));
  const costBySku = new Map(products.map((p) => [p.sku.toUpperCase(), p.cogsCents]));

  const orders = await prisma.order.findMany({
    where: { organizationId: org.id, placedAt: { lt: before } },
    orderBy: { placedAt: "asc" },
    select: {
      id: true,
      orderSeq: true,
      externalOrderNumber: true,
      placedAt: true,
      status: true,
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
    for (const item of order.items) {
      const unit = (item.productId ? costById.get(item.productId) : undefined) ?? costBySku.get(item.sku.toUpperCase());
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

    totals.all.old += oldProfit;
    totals.all.next += result.netProfitCents;
    if (PAID.has(order.status)) {
      totals.paid.old += oldProfit;
      totals.paid.next += result.netProfitCents;
      totals.paid.revenue += result.productsPaidCents;
      totals.paid.cogs += result.cogsCents;
      totals.paid.fees += result.feeCents;
      totals.paid.commission += result.commissionCents;
      totals.paid.p2pDiscount += result.p2pDiscountCents;
    }

    if (order.netProfitCents === result.netProfitCents) continue;
    changed += 1;
    console.log(
      `${label.padEnd(10)} ${order.placedAt.toISOString().slice(0, 10)}  ${order.status.padEnd(11)} ${(order.paymentMethod || "-").padEnd(11)} ${money(oldProfit).padStart(10)} -> ${money(result.netProfitCents)}`,
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
  console.log("\nPaid orders (completed + processing):");
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
