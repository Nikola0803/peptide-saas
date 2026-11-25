import { PrismaClient } from "@prisma/client";
import pricing from "../prisma/evlv-warrior-pricing.json";

// Sets EVLV prices from the reviewed Warrior lists in
// prisma/evlv-warrior-pricing.json:
//   priceCents              -> StoreMapping.storePriceCents (single vial, retail)
//   retailCasePriceCents    -> StoreMapping.retailCasePriceCents (10-vial kit, retail)
//   wholesaleCasePriceCents -> StoreMapping.wholesaleCasePriceCents (10-vial case, partner portal)
// Products not in the file keep their current prices. Matched by the EVLV
// brand's StoreMapping slug.
//
//   npm run db:prices:evlv            -> dry run, prints what would change
//   npm run db:prices:evlv -- --apply -> writes the changes

type Price = { priceCents: number; retailCasePriceCents?: number; wholesaleCasePriceCents?: number };
const prisma = new PrismaClient();
const PRICES = (pricing as { pricesBySlug: Record<string, Price> }).pricesBySlug;
const apply = process.argv.includes("--apply");
const money = (cents: number | null | undefined) => (cents == null ? "-" : `$${(cents / 100).toFixed(2)}`);

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error("EVLV organization is missing");
  const brand = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: "evlv" } },
  });
  if (!brand) throw new Error("EVLV brand is missing");

  const mappings = await prisma.storeMapping.findMany({
    where: { brandId: brand.id, slug: { in: Object.keys(PRICES) } },
  });
  const bySlug = new Map(mappings.map((m) => [m.slug, m]));
  let changed = 0;
  let same = 0;
  const missing: string[] = [];

  for (const [slug, price] of Object.entries(PRICES)) {
    const mapping = bySlug.get(slug);
    if (!mapping) {
      missing.push(slug);
      continue;
    }
    // order-engine.ts charges wholesale per vial as case / 10.
    if (price.wholesaleCasePriceCents != null && price.wholesaleCasePriceCents % 10 !== 0) {
      throw new Error(`${slug}: wholesale case price must divide evenly into 10 vials`);
    }
    const data = {
      storePriceCents: price.priceCents,
      retailCasePriceCents: price.retailCasePriceCents ?? mapping.retailCasePriceCents,
      wholesaleCasePriceCents: price.wholesaleCasePriceCents ?? mapping.wholesaleCasePriceCents,
    };
    if (
      mapping.storePriceCents === data.storePriceCents &&
      mapping.retailCasePriceCents === data.retailCasePriceCents &&
      mapping.wholesaleCasePriceCents === data.wholesaleCasePriceCents
    ) {
      same += 1;
      continue;
    }
    changed += 1;
    console.log(
      `${apply ? "UPDATE" : "would update"}  ${slug.padEnd(30)} vial ${money(mapping.storePriceCents).padStart(8)} -> ${money(data.storePriceCents).padStart(8)}` +
        `  kit ${money(mapping.retailCasePriceCents).padStart(9)} -> ${money(data.retailCasePriceCents).padStart(9)}` +
        `  wholesale ${money(mapping.wholesaleCasePriceCents).padStart(9)} -> ${money(data.wholesaleCasePriceCents).padStart(9)}`,
    );
    if (apply) await prisma.storeMapping.update({ where: { id: mapping.id }, data });
  }

  console.log(`\n${changed} ${apply ? "updated" : "to update"}, ${same} already correct.`);
  if (missing.length) console.log(`No EVLV CRM mapping (skipped): ${missing.join(", ")}`);
  if (!apply && changed) console.log("Dry run only. Re-run with --apply to save.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
