import { PrismaClient } from "@prisma/client";
import pricing from "../prisma/evlv-au-pricing.json";
import catalog from "../prisma/evlv-catalog.json";
import { AUD_PER_USD } from "../src/lib/store-currency";

// Sets EVLV Australia (CRM brand "evlv-au") prices and costs, all in AUD,
// from prisma/evlv-au-pricing.json:
//   priceCents (or salePriceCents with --sale) -> StoreMapping.storePriceCents
//   (no fixed 10-pack: retailCasePriceCents is cleared, so 3/5/10 vials get
//   the standard 3%/7%/10% quantity discount, see quantity-pricing.ts)
//   cogsCents                                  -> StoreMapping.cogsCents (AUD cost per vial)
// The active evlv-au mappings ARE the AU catalog, so any AU mapping whose
// slug is not in the file is deactivated (it disappears from the AU site).
// A slug with no AU mapping yet gets one, pointing at the product that the
// same slug uses on the US store, or (if the US store no longer lists it)
// the CRM product with that slug's SKU from evlv-catalog.json. If the CRM has
// no product with that SKU at all, the product is created from the catalog
// entry (cost = the AU cost in USD, stock 0: AU inventory is not gated). The
// US store's mappings are never touched.
//
//   npm run db:prices:evlv-au                     -> dry run, prints changes
//   npm run db:prices:evlv-au -- --apply          -> writes them
//   npm run db:prices:evlv-au -- --sale [--apply] -> charge the sale prices

type Price = {
  listName: string;
  priceCents: number;
  cogsCents: number;
  salePriceCents?: number;
};
const prisma = new PrismaClient();
const doc = pricing as { pricesBySlug: Record<string, Price>; pendingNewProducts: Record<string, Price> };
const PRICES = doc.pricesBySlug;
const apply = process.argv.includes("--apply");
const sale = process.argv.includes("--sale");
const aud = (cents: number | null | undefined) => (cents == null ? "-" : `A$${(cents / 100).toFixed(2)}`);

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error("EVLV organization is missing");
  const [auBrand, usBrand] = await Promise.all([
    prisma.brand.findUnique({ where: { organizationId_slug: { organizationId: org.id, slug: "evlv-au" } } }),
    prisma.brand.findUnique({ where: { organizationId_slug: { organizationId: org.id, slug: "evlv" } } }),
  ]);
  if (!auBrand) throw new Error('EVLV Australia brand is missing. Run "npm run db:seed:evlv-au" first.');
  if (!usBrand) throw new Error("EVLV US brand is missing");

  const [auMappings, usMappings] = await Promise.all([
    prisma.storeMapping.findMany({ where: { brandId: auBrand.id } }),
    prisma.storeMapping.findMany({ where: { brandId: usBrand.id, slug: { in: Object.keys(PRICES) } } }),
  ]);
  const auBySlug = new Map(auMappings.map((m) => [m.slug, m]));
  const productIdBySlug = new Map(usMappings.map((m) => [m.slug as string, m.productId]));
  // Slugs the US store dropped: find the product by its catalog SKU.
  type CatalogItem = {
    slug: string; sku: string; name: string; image?: string; purity?: string; categoryLabel?: string;
    shortDescription?: string; description?: string; storage?: string; reconstitution?: string;
  };
  const catalogBySlug = new Map((catalog as CatalogItem[]).map((p) => [p.slug, p]));
  const skuBySlug = new Map((catalog as CatalogItem[]).map((p) => [p.slug, p.sku]));
  const missingSkus = Object.keys(PRICES)
    .filter((slug) => !productIdBySlug.has(slug) && skuBySlug.has(slug))
    .map((slug) => skuBySlug.get(slug) as string);
  if (missingSkus.length) {
    const products = await prisma.product.findMany({
      where: { organizationId: org.id, sku: { in: missingSkus } },
      select: { id: true, sku: true },
    });
    for (const [slug, sku] of skuBySlug) {
      const product = products.find((p) => p.sku === sku);
      if (product && !productIdBySlug.has(slug)) productIdBySlug.set(slug, product.id);
    }
  }

  let created = 0;
  let updated = 0;
  let same = 0;
  const noProduct: string[] = [];

  console.log(`Charging ${sale ? "SALE" : "website"} prices${apply ? "" : " (dry run)"}\n`);
  for (const [slug, price] of Object.entries(PRICES)) {
    const vial = sale && price.salePriceCents != null ? price.salePriceCents : price.priceCents;
    const data = { storePriceCents: vial, retailCasePriceCents: null, cogsCents: price.cogsCents, active: true };
    const margin = Math.round(((vial - price.cogsCents) / vial) * 100);
    const line = `${slug.padEnd(30)} vial ${aud(vial).padStart(9)}  10 vials ${aud(Math.round(vial * 9)).padStart(10)}  cost ${aud(price.cogsCents).padStart(8)}  margin ${margin}%`;
    const existing = auBySlug.get(slug);
    if (existing) {
      if (
        existing.storePriceCents === data.storePriceCents &&
        existing.retailCasePriceCents === data.retailCasePriceCents &&
        existing.cogsCents === data.cogsCents &&
        existing.active
      ) {
        same += 1;
        continue;
      }
      updated += 1;
      console.log(`${apply ? "UPDATE" : "would update"}  ${line}   (was ${aud(existing.storePriceCents)}${existing.active ? "" : ", inactive"})`);
      if (apply) await prisma.storeMapping.update({ where: { id: existing.id }, data });
      continue;
    }
    let productId = productIdBySlug.get(slug);
    const item = catalogBySlug.get(slug);
    if (!productId && !item) {
      noProduct.push(slug);
      continue;
    }
    created += 1;
    console.log(`${apply ? "ADD" : "would add"}     ${line}${productId ? "" : "   (new CRM product " + item!.sku + ")"}`);
    if (apply) {
      if (!productId) {
        const product = await prisma.product.upsert({
          where: { organizationId_sku: { organizationId: org.id, sku: item!.sku } },
          update: {},
          create: {
            organizationId: org.id,
            sku: item!.sku,
            chemicalName: item!.name,
            cogsCents: Math.round(price.cogsCents / AUD_PER_USD),
            masterStock: 0,
            imageUrl: item!.image ? `https://evlvpeptides.com${item!.image}` : null,
            purity: item!.purity,
            categoryLabel: item!.categoryLabel,
            shortDescription: item!.shortDescription,
            description: item!.description,
            storageInstructions: item!.storage,
            reconstitutionInstructions: item!.reconstitution,
          },
        });
        productId = product.id;
      }
      await prisma.storeMapping.create({
        data: { ...data, brandId: auBrand.id, productId, externalProductId: `au-${slug}`, slug },
      });
    }
  }

  const remove = auMappings.filter((m) => m.active && m.slug && !(m.slug in PRICES));
  for (const m of remove) {
    console.log(`${apply ? "HIDE" : "would hide"}    ${String(m.slug).padEnd(30)} (not in the AU price list)`);
    if (apply) await prisma.storeMapping.update({ where: { id: m.id }, data: { active: false } });
  }

  console.log(`\n${created} added, ${updated} updated, ${remove.length} hidden, ${same} already correct.`);
  if (noProduct.length) console.log(`No CRM product and no catalog entry for these slugs, not added: ${noProduct.join(", ")}`);
  const pending = Object.keys(doc.pendingNewProducts);
  if (pending.length) console.log(`Waiting for a CRM product (pendingNewProducts): ${pending.join(", ")}`);
  if (!apply && (created || updated || remove.length)) console.log("Dry run only. Re-run with -- --apply to save.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
