import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const STORE_DOMAIN = "evlvpeptides.com";

function canonicalStorefrontImageUrl(image: string | undefined): string | null {
  if (!image) return null;
  // The storefront's own product assets should always be stored once as a
  // canonical absolute URL. Using lastIndexOf also repairs legacy values such
  // as "https://evlvpeptides.comhttps://evlvpeptides.com/images/...".
  const imagesMarker = "/images/";
  const markerIndex = image.lastIndexOf(imagesMarker);
  if (markerIndex >= 0) return `https://${STORE_DOMAIN}${image.slice(markerIndex)}`;
  if (/^https?:\/\//i.test(image)) return image;
  return `https://${STORE_DOMAIN}${image.startsWith("/") ? "" : "/"}${image}`;
}

type CatalogProduct = {
  slug: string;
  sku: string;
  name: string;
  price: number;
  image?: string;
  purity?: string;
  categoryLabel?: string;
  shortDescription: string;
  description: string;
  storage: string;
  reconstitution?: string;
  bulkOption?: { qty: number; price: number };
  stockQty?: number;
};

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error("EVLV organization is missing; run the initial EVLV seed first");
  const brand = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: "evlv" } },
  });
  if (!brand) throw new Error("EVLV brand is missing; run the initial EVLV seed first");

  const sourceUrl = process.env.EVLV_CATALOG_URL || "https://www.evlvpeptides.com/api/catalog";
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`EVLV catalog request failed: ${response.status}`);
  const payload = await response.json() as { products?: CatalogProduct[] };
  const catalog = payload.products;
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error("EVLV catalog response did not contain products");
  }
  for (const item of catalog) {
    const priceCents = Math.round(item.price * 100);
    const wholesaleCasePriceCents = Math.round(
      (item.bulkOption?.qty === 10 ? item.bulkOption.price : item.price * 9) * 100,
    );
    const imageUrl = canonicalStorefrontImageUrl(item.image);
    const product = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: item.sku } },
      update: {
        chemicalName: item.name,
        imageUrl,
        shortDescription: item.shortDescription,
        description: item.description,
        purity: item.purity,
        categoryLabel: item.categoryLabel,
        storageInstructions: item.storage,
        reconstitutionInstructions: item.reconstitution,
        ...(item.stockQty == null ? {} : { masterStock: item.stockQty }),
      },
      create: {
        organizationId: org.id,
        sku: item.sku,
        chemicalName: item.name,
        cogsCents: Math.round(priceCents * 0.3),
        masterStock: item.stockQty ?? 0,
        imageUrl,
        shortDescription: item.shortDescription,
        description: item.description,
        purity: item.purity,
        categoryLabel: item.categoryLabel,
        storageInstructions: item.storage,
        reconstitutionInstructions: item.reconstitution,
      },
    });

    await prisma.storeMapping.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: item.slug } },
      update: {
        productId: product.id,
        storePriceCents: priceCents,
        wholesaleCasePriceCents,
        active: true,
      },
      create: {
        productId: product.id,
        brandId: brand.id,
        externalProductId: item.slug,
        slug: item.slug,
        storePriceCents: priceCents,
        wholesaleCasePriceCents,
        active: true,
      },
    });
  }

  console.log(`Synced ${catalog.length} EVLV products, images, retail prices, and 10-vial case prices.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
