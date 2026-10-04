/**
 * list-products.ts — diagnostic helper
 * Prints every Product SKU + name in the DB so you can check for mismatches.
 *
 *   npx tsx scripts/list-products.ts
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    orderBy: { sku: "asc" },
    select: { sku: true, chemicalName: true, masterStock: true },
  });
  console.log(`\n${products.length} products in DB:\n`);
  for (const p of products) {
    console.log(`  ${p.sku.padEnd(12)} stock=${String(p.masterStock).padEnd(6)} ${p.chemicalName}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
