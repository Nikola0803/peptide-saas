import { PrismaClient } from "@prisma/client";
import inventory from "../prisma/evlv-warrior-inventory.json";

// Syncs the reviewed Warrior physical-stock snapshot to the EVLV catalogue.
// This script never changes customer-facing prices. It is intentionally dry-run
// by default: `npm run db:stock:evlv -- --apply` performs the writes.
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const stockBySlug = inventory.stockBySlug as Record<string, number>;

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error("EVLV organization is missing");
  const brand = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: "evlv" } },
  });
  if (!brand) throw new Error("EVLV brand is missing");

  const mappings = await prisma.storeMapping.findMany({
    where: { brandId: brand.id, slug: { in: Object.keys(stockBySlug) } },
    include: { product: true },
  });
  const bySlug = new Map(mappings.map((mapping) => [mapping.slug, mapping]));
  const missing: string[] = [];
  let changed = 0;
  let unchanged = 0;

  for (const [slug, masterStock] of Object.entries(stockBySlug)) {
    const mapping = bySlug.get(slug);
    if (!mapping) {
      missing.push(slug);
      continue;
    }
    const active = masterStock > 0;
    if (mapping.product.masterStock === masterStock && mapping.active === active) {
      unchanged += 1;
      continue;
    }
    changed += 1;
    console.log(
      `${apply ? "UPDATE" : "would update"} ${slug.padEnd(32)} stock ${String(mapping.product.masterStock).padStart(4)} -> ${String(masterStock).padStart(4)}; ${mapping.active ? "active" : "inactive"} -> ${active ? "active" : "inactive"}`,
    );
    if (apply) {
      await prisma.$transaction([
        prisma.product.update({ where: { id: mapping.productId }, data: { masterStock } }),
        prisma.storeMapping.update({ where: { id: mapping.id }, data: { active } }),
      ]);
    }
  }

  console.log(`\n${changed} ${apply ? "updated" : "to update"}; ${unchanged} already correct.`);
  if (missing.length) console.log(`No EVLV CRM mapping yet (skipped): ${missing.join(", ")}`);
  if (!apply && changed) console.log("Dry run only. Re-run with --apply to save.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
