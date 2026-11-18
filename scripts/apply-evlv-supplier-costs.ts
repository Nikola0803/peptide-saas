import { PrismaClient } from "@prisma/client";
import supplierCosts from "../prisma/evlv-supplier-costs.json";

// One-time (re-runnable) update: sets each EVLV product's unit cost (COGS)
// from Nikola's supplier sheet, stored in prisma/evlv-supplier-costs.json as
// cents per vial (kit price / 10).
//
// Products are found through the EVLV brand's StoreMapping slug, which is
// stable even where older SKUs differ. Products not on the sheet are left
// untouched. Past orders keep the profit saved when they were placed.
//
//   npm run db:costs:evlv            -> dry run, prints what would change
//   npm run db:costs:evlv -- --apply -> writes the changes

const prisma = new PrismaClient();
const COSTS = (supplierCosts as { costsCentsBySlug: Record<string, number> }).costsCentsBySlug;
const apply = process.argv.includes("--apply");
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error("EVLV organization is missing");
  const brand = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: "evlv" } },
  });
  if (!brand) throw new Error("EVLV brand is missing");

  const mappings = await prisma.storeMapping.findMany({
    where: { brandId: brand.id, slug: { in: Object.keys(COSTS) } },
    include: { product: true },
  });
  const bySlug = new Map(mappings.map((m) => [m.slug, m]));

  let changed = 0;
  let same = 0;
  const missing: string[] = [];
  for (const [slug, cogsCents] of Object.entries(COSTS)) {
    const mapping = bySlug.get(slug);
    if (!mapping) {
      missing.push(slug);
      continue;
    }
    const product = mapping.product;
    if (product.cogsCents === cogsCents) {
      same += 1;
      continue;
    }
    changed += 1;
    console.log(
      `${apply ? "UPDATE" : "would update"}  ${slug.padEnd(28)} ${product.sku.padEnd(22)} ${money(product.cogsCents).padStart(9)} -> ${money(cogsCents)}`,
    );
    if (apply) {
      await prisma.product.update({ where: { id: product.id }, data: { cogsCents } });
    }
  }

  console.log(`\n${changed} ${apply ? "updated" : "to update"}, ${same} already correct.`);
  if (missing.length) console.log(`Not in the CRM (skipped): ${missing.join(", ")}`);
  if (!apply && changed) console.log("Dry run only. Re-run with --apply to save.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
