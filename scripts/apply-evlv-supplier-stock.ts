import { PrismaClient } from "@prisma/client";
import supplierStock from "../prisma/evlv-supplier-stock.json";

// Sets each EVLV product's stock (Product.masterStock) from Nikola's
// supplier sheet, stored in prisma/evlv-supplier-stock.json by storefront
// slug. Every product mapped to the EVLV brand that is NOT on the sheet is
// set to 0, so the store sells only what the sheet says is in stock.
//
// Nothing else changes: prices, costs, store mappings (products stay
// listed, so a sold-out one shows "Notify me"), coupons and past orders
// are untouched. No email is sent. Stock only blocks checkout once the
// stock gate is on (STOCK_GATE_BRANDS, see src/lib/stock-gate.ts).
//
//   npm run db:stock:evlv            -> dry run, prints what would change
//   npm run db:stock:evlv -- --apply -> writes the changes

const prisma = new PrismaClient();
const STOCK = (supplierStock as { stockBySlug: Record<string, number> }).stockBySlug;
const apply = process.argv.includes("--apply");

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error("EVLV organization is missing");
  const brand = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: "evlv" } },
  });
  if (!brand) throw new Error("EVLV brand is missing");

  const mappings = await prisma.storeMapping.findMany({
    where: { brandId: brand.id, slug: { not: null } },
    include: { product: { select: { id: true, sku: true, masterStock: true } } },
    orderBy: { slug: "asc" },
  });

  // One product can have more than one mapping; set each product once.
  const seen = new Set<string>();
  const rows: { slug: string; sku: string; from: number; to: number; onSheet: boolean; active: boolean }[] = [];
  for (const mapping of mappings) {
    const slug = mapping.slug as string;
    if (seen.has(mapping.product.id)) continue;
    seen.add(mapping.product.id);
    const onSheet = slug in STOCK;
    rows.push({
      slug,
      sku: mapping.product.sku,
      from: mapping.product.masterStock,
      to: onSheet ? Math.max(0, Math.floor(STOCK[slug])) : 0,
      onSheet,
      active: mapping.active,
    });
  }

  const label = (n: number) => (n > 0 ? "in stock" : "sold out");
  let changed = 0;
  for (const row of rows) {
    const note = row.onSheet ? "" : "  (not on sheet)";
    const listed = row.active ? "" : "  (hidden on store)";
    if (row.from === row.to) {
      console.log(`same          ${row.slug.padEnd(30)} ${row.sku.padEnd(14)} ${String(row.to).padStart(4)}  ${label(row.to)}${note}${listed}`);
      continue;
    }
    changed += 1;
    console.log(
      `${apply ? "UPDATE      " : "would update"}  ${row.slug.padEnd(30)} ${row.sku.padEnd(14)} ${String(row.from).padStart(4)} -> ${String(row.to).padStart(4)}  ${label(row.from)} -> ${label(row.to)}${note}${listed}`,
    );
  }

  const mappedSlugs = new Set(rows.map((row) => row.slug));
  const notInCrm = Object.entries(STOCK).filter(([slug, qty]) => qty > 0 && !mappedSlugs.has(slug)).map(([slug]) => slug);
  const inStock = rows.filter((row) => row.to > 0).length;
  console.log(`\n${rows.length} EVLV products: ${inStock} in stock, ${rows.length - inStock} sold out after this run.`);
  console.log(`${changed} ${apply ? "updated" : "to update"}.`);
  if (notInCrm.length) console.log(`In stock on the sheet but not on the EVLV store (skipped): ${notInCrm.join(", ")}`);

  if (apply && changed) {
    await prisma.$transaction(
      rows
        .filter((row) => row.from !== row.to)
        .map((row) => prisma.product.update({ where: { id: mappings.find((m) => m.slug === row.slug)!.product.id }, data: { masterStock: row.to } })),
    );
  }
  if (!apply && changed) console.log("Dry run only. Re-run with --apply to save.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
