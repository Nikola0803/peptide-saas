/**
 * sync-catalog-stock.ts
 * Run once on the VPS after merging to apply stock levels from the
 * VVG catalog upload sheet (v5 / 2026-09-09).
 *
 *   npx tsx scripts/sync-catalog-stock.ts
 *
 * What it does:
 *  - Sets Product.masterStock to the spreadsheet qty for every matched SKU
 *  - Sets StoreMapping.active = true  for in-stock  (publish + instock)
 *  - Sets StoreMapping.active = false for out-of-stock (outofstock OR private)
 *
 * SKUs that don't exist in the DB are reported as warnings, not errors.
 * Run it as many times as you like — it is idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Source: VVGcataloguploadsheet20260909v5FINALrounded.xlsx
// Fields: sku | qty | active (true = in-stock publish, false = hide)
const CATALOG: { sku: string; qty: number; active: boolean }[] = [
  // --- IN STOCK (publish + instock) ---
  { sku: "10AD",   qty: 10, active: true },
  { sku: "BB20",   qty: 33, active: true },
  { sku: "CART20", qty: 10, active: true },
  { sku: "CBL60",  qty: 10, active: true },
  { sku: "CP10",   qty: 31, active: true },
  { sku: "CP20",   qty: 10, active: true },
  { sku: "GHK50",  qty: 29, active: true },
  { sku: "GW70",   qty:  9, active: true },
  { sku: "KPV10",  qty: 20, active: true },
  { sku: "KW80",   qty: 96, active: true },
  { sku: "MOT10",  qty: 25, active: true },
  { sku: "MOT20",  qty: 20, active: true },
  { sku: "MOT40",  qty: 30, active: true },
  { sku: "NAD500", qty: 19, active: true },
  { sku: "OXY10",  qty: 10, active: true },
  { sku: "PG1200", qty: 25, active: true },
  { sku: "PT10",   qty: 10, active: true },
  { sku: "RET10",  qty: 50, active: true },
  { sku: "RET15",  qty: 24, active: true },
  { sku: "RET30",  qty: 30, active: true },
  { sku: "SEM10",  qty: 17, active: true },
  { sku: "SEM5",   qty: 20, active: true },
  { sku: "SLK10",  qty:  4, active: true },
  { sku: "SMX10",  qty:  5, active: true },
  { sku: "SS3110", qty: 10, active: true },
  { sku: "TA15",   qty: 10, active: true },
  { sku: "TES10",  qty: 15, active: true },
  { sku: "TIR10",  qty: 19, active: true },
  { sku: "TIR15",  qty: 30, active: true },
  { sku: "TIR30",  qty: 29, active: true },
  { sku: "TIR60",  qty:  7, active: true },
  { sku: "BAC30",  qty: 46, active: true },

  // --- OUT OF STOCK (publish + outofstock) — hidden from storefront ---
  { sku: "BB10",    qty: 0, active: false },
  { sku: "BPC10",   qty: 0, active: false },
  { sku: "BPC20",   qty: 0, active: false },
  { sku: "BPC5",    qty: 0, active: false },
  { sku: "CGL10",   qty: 0, active: false },
  { sku: "CGL20",   qty: 0, active: false },
  { sku: "CGL5",    qty: 0, active: false },
  { sku: "HU10",    qty: 0, active: false },
  { sku: "IGF1",    qty: 0, active: false },
  { sku: "MT-2",    qty: 0, active: false },
  { sku: "NAD1000", qty: 0, active: false },
  { sku: "RET60",   qty: 0, active: false },
  { sku: "SS3150",  qty: 0, active: false },
  { sku: "TB10",    qty: 0, active: false },
  { sku: "TB20",    qty: 0, active: false },
  { sku: "TB5",     qty: 0, active: false },
  { sku: "TES20",   qty: 0, active: false },

  // --- PRIVATE (already hidden, keep active=false) ---
  { sku: "AR90",    qty: 0,  active: false },
  { sku: "BB30",    qty: 50, active: false },
  { sku: "KPVo500", qty: 0,  active: false },
  { sku: "5AM",     qty: 0,  active: false },
  { sku: "10AM",    qty: 0,  active: false },
  { sku: "50AM",    qty: 0,  active: false },
];

async function main() {
  console.log(`Syncing ${CATALOG.length} products from catalog v5...\n`);

  let updated = 0;
  let notFound = 0;

  for (const row of CATALOG) {
    const product = await prisma.product.findFirst({
      where: { sku: row.sku },
      select: { id: true, sku: true, chemicalName: true },
    });

    if (!product) {
      console.warn(`  WARN  SKU not found in DB: ${row.sku}`);
      notFound++;
      continue;
    }

    // Update stock on the product itself
    await prisma.product.update({
      where: { id: product.id },
      data: { masterStock: row.qty },
    });

    // Update all StoreMappings for this product
    const { count } = await prisma.storeMapping.updateMany({
      where: { productId: product.id },
      data: { active: row.active },
    });

    const tag = row.active ? "IN STOCK " : "HIDDEN   ";
    console.log(`  ${tag} ${row.sku.padEnd(10)} ${product.chemicalName.substring(0, 40).padEnd(40)} stock=${row.qty}  mappings=${count}`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}  Not found: ${notFound}`);

  if (notFound > 0) {
    console.log("\nCheck the SKUs above — they may use different codes in the DB.");
    console.log("Run: npx tsx scripts/list-products.ts  to see all DB SKUs.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
