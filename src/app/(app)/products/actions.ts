"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/upload";
import { stripDoseSuffix, doseNumber } from "@/lib/dose";

function dollarsToCents(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// One-time fix for a specific data mixup: EVLV-1/2/3's real supplier
// inventory got imported into the CRM as its own separate product line
// under a raw supplier codename ("GP-1/GP-2/GP-3") instead of being
// matched to the existing branded evlv-site catalog. evlv-site's live
// feed groups a storefront listing by StoreMapping.slug -- so renaming
// just the slug (not the underlying Product/SKU/cost data, which stays
// exactly as-is) is what makes that real price/stock start flowing into
// the existing "EVLV-1/2/3" cards on the storefront instead of showing
// up as a separate, oddly-named listing. Confirmed these are the exact
// live slugs from the storefront before writing this -- narrowly scoped
// to just these 10, and safe to click more than once (a slug that's
// already been renamed just won't match anything the second time).
const GP_SLUG_RENAME: Record<string, string> = {
  "gp-1-5mg": "evlv-1-5mg",
  "gp-1-10mg": "evlv-1-10mg",
  "gp-2-10mg": "evlv-2-10mg",
  "gp-2-15mg": "evlv-2-15mg",
  "gp-2-30mg": "evlv-2-30mg",
  "gp-2-60mg": "evlv-2-60mg",
  "gp-3-10mg": "evlv-3-10mg",
  "gp-3-15mg": "evlv-3-15mg",
  "gp-3-30mg": "evlv-3-30mg",
  "gp-3-60mg": "evlv-3-60mg",
};

export interface GpSlugFixResult {
  changed: { from: string; to: string; brand: string; product: string }[];
  alreadyDone: string[];
  // Slugs from GP_SLUG_RENAME that matched no active StoreMapping AND
  // whose evlv-* target also doesn't exist -- i.e. genuinely unresolved,
  // not just previously renamed. Surfaced separately so this never
  // silently reports "nothing to do" for a product that's actually still
  // stuck on its gp-* slug under a different live value than assumed.
  notFound: string[];
}

export async function fixGpSlugs(): Promise<GpSlugFixResult> {
  const { organization } = await requireOrg();

  // Renaming the StoreMapping.slug alone is what fixes the *storefront*
  // (that's the merge key mergeProducts() uses) -- but it left the
  // underlying Product.chemicalName untouched, so the CRM's own Products
  // list kept showing "GP-1 5MG" etc. even after the storefront was
  // showing the right thing. Rename both in the same pass so the CRM and
  // the storefront agree. Only touches the chemicalName, never sku/COGS/
  // supplier fields -- those are real inventory identifiers, not display
  // text, and renaming them isn't this button's job.
  const mappings = await prisma.storeMapping.findMany({
    where: {
      slug: { in: Object.keys(GP_SLUG_RENAME) },
      product: { organizationId: organization.id },
    },
    include: { product: true, brand: true },
  });

  const changed: GpSlugFixResult["changed"] = [];
  for (const m of mappings) {
    const from = m.slug as string;
    const to = GP_SLUG_RENAME[from];
    const newChemicalName = m.product.chemicalName.replace(/^GP-([123])/i, (_match, n) => `EVLV-${n}`);
    await prisma.storeMapping.update({ where: { id: m.id }, data: { slug: to } });
    if (newChemicalName !== m.product.chemicalName) {
      await prisma.product.update({ where: { id: m.product.id }, data: { chemicalName: newChemicalName } });
    }
    changed.push({ from, to, brand: m.brand.name, product: newChemicalName });
  }

  // A GP_SLUG_RENAME key that matched nothing this run is ambiguous with
  // the query above alone -- it could mean "already renamed on a
  // previous click" (fine), or it could mean the live slug never
  // actually matched this map's assumption in the first place (NOT
  // fine -- that product is silently still stuck on "gp-*", unrenamed,
  // and this button would keep reporting it as harmless). Distinguish
  // the two by checking whether the *target* evlv-* slug now exists --
  // if it does, the rename really did happen (this run or a previous
  // one); if neither the gp-* nor the evlv-* slug exists, something else
  // is going on and it's surfaced separately instead of being lumped in
  // with "already done".
  const renamedFromSlugs = new Set(mappings.map((m) => m.slug as string));
  const unmatched = Object.keys(GP_SLUG_RENAME).filter((s) => !renamedFromSlugs.has(s));
  const targetSlugs = unmatched.map((s) => GP_SLUG_RENAME[s]);
  const existingTargets = targetSlugs.length
    ? await prisma.storeMapping.findMany({
        where: { slug: { in: targetSlugs }, product: { organizationId: organization.id } },
        select: { slug: true },
      })
    : [];
  const existingTargetSlugs = new Set(existingTargets.map((m) => m.slug as string));

  const alreadyDone: string[] = [];
  const notFound: string[] = [];
  for (const s of unmatched) {
    (existingTargetSlugs.has(GP_SLUG_RENAME[s]) ? alreadyDone : notFound).push(s);
  }

  revalidatePath("/products");
  revalidatePath("/products/fix-gp-slugs");

  return { changed, alreadyDone, notFound };
}

export async function createProduct(formData: FormData) {
  const { organization } = await requireOrg();

  const product = await prisma.product.create({
    data: {
      organizationId: organization.id,
      sku: String(formData.get("sku") ?? "").trim(),
      chemicalName: String(formData.get("chemicalName") ?? "").trim(),
      cogsCents: dollarsToCents(String(formData.get("cogs") ?? "0")),
      masterStock: Number(formData.get("masterStock") ?? 0),
    },
  });

  revalidatePath("/products");
  redirect(`/products/${product.id}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  const { organization } = await requireOrg();

  await prisma.product.update({
    where: { id: productId, organizationId: organization.id },
    data: {
      sku: String(formData.get("sku") ?? "").trim(),
      chemicalName: String(formData.get("chemicalName") ?? "").trim(),
      cogsCents: dollarsToCents(String(formData.get("cogs") ?? "0")),
      masterStock: Number(formData.get("masterStock") ?? 0),
      fulfillmentSku: String(formData.get("fulfillmentSku") ?? "").trim() || null,
    },
  });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// The markup step: whatever a supplier charges (SupplierProduct.costCents,
// set on their own side) has no bearing on what this sets — staff types
// the retail price directly, however they want to mark it up. Creates the
// StoreMapping if this product isn't on that brand's storefront yet
// (common right after a supplier price-list import, which only touches
// the master catalog + SupplierProduct, never pricing).
export async function setStorePrice(productId: string, brandId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Product not found");
  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: organization.id } });
  if (!brand) throw new Error("Brand not found");

  const price = Number(formData.get("price") ?? 0);
  if (!(price > 0)) throw new Error("Price must be greater than zero");
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugInput ? slugify(slugInput) : slugify(product.sku);

  const existing = await prisma.storeMapping.findFirst({ where: { productId, brandId } });
  if (existing) {
    await prisma.storeMapping.update({
      where: { id: existing.id },
      data: { storePriceCents: Math.round(price * 100), slug, active: true },
    });
  } else {
    await prisma.storeMapping.create({
      data: {
        productId,
        brandId,
        externalProductId: slug,
        slug,
        storePriceCents: Math.round(price * 100),
        active: true,
      },
    });
  }

  revalidatePath(`/products/${productId}`);
}

// Pulls a product off one brand's storefront (StoreMapping.active =
// false) without deleting the Product itself -- order history, COAs, and
// supplier links all stay intact, and re-adding it later is just
// setStorePrice again. Use this instead of deleteProduct whenever a
// product just shouldn't be sold right now (inventory correction,
// discontinued SKU, out of stock indefinitely) rather than never having
// existed. evlv-site's live feed (/api/store/products) only reads
// active: true mappings, so this is what actually pulls it off the shop
// grid and homepage.
export async function removeFromStorefront(productId: string, brandId: string) {
  const { organization } = await requireOrg();

  const mapping = await prisma.storeMapping.findFirst({
    where: { productId, brandId, product: { organizationId: organization.id } },
  });
  if (!mapping) throw new Error("Not listed on that storefront");

  await prisma.storeMapping.update({ where: { id: mapping.id }, data: { active: false } });

  revalidatePath(`/products/${productId}`);
}

// Storefront content -- the fields that make this Product a real source
// of truth for evlv-site's shop grid + PDP (see Product.imageUrl etc. in
// schema.prisma), separate from updateProduct's financial/inventory fields
// so this form can be its own card without touching SKU/COGS/stock.
export async function updateProductContent(productId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const str = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v ? v : null;
  };

  await prisma.product.update({
    where: { id: productId, organizationId: organization.id },
    data: {
      shortDescription: str("shortDescription"),
      description: str("description"),
      purity: str("purity"),
      categoryLabel: str("categoryLabel"),
      storageInstructions: str("storageInstructions"),
      reconstitutionInstructions: str("reconstitutionInstructions"),
    },
  });

  revalidatePath(`/products/${productId}`);
}

// Separate from updateProductContent so a plain content edit (no new file
// chosen) never re-runs the upload branch -- mirrors addCoaDocumentFile's
// pattern of one action per file input.
export async function uploadProductImage(productId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file first");

  const result = await saveUploadedFile(organization.id, file);
  if (!result.ok) throw new Error(result.reason);

  await prisma.product.update({ where: { id: productId }, data: { imageUrl: result.media.url } });

  revalidatePath(`/products/${productId}`);
}

export async function deleteProduct(productId: string) {
  const { organization } = await requireOrg();
  await prisma.product.delete({ where: { id: productId, organizationId: organization.id } });
  revalidatePath("/products");
  redirect("/products");
}

export async function addCoaDocument(productId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");

  const url = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!url) throw new Error("A URL is required");

  await prisma.coaDocument.create({
    data: { productId, url, label: label || null },
  });

  revalidatePath(`/products/${productId}`);
}

// Uploads the COA PDF/image straight into the media library (same
// storage path as /media) and links it, instead of requiring an
// already-hosted URL to paste in.
export async function addCoaDocumentFile(productId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file first");
  const label = String(formData.get("label") ?? "").trim();

  const result = await saveUploadedFile(organization.id, file);
  if (!result.ok) throw new Error(result.reason);

  await prisma.coaDocument.create({
    data: { productId, url: result.media.url, label: label || null, mediaId: result.media.id },
  });

  revalidatePath(`/products/${productId}`);
  revalidatePath("/media");
}

export async function removeCoaDocument(productId: string, coaId: string) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");
  const coa = await prisma.coaDocument.findFirst({ where: { id: coaId, productId } });
  if (!coa) throw new Error("Not found");
  await prisma.coaDocument.delete({ where: { id: coaId } });
  revalidatePath(`/products/${productId}`);
}

// "We decide which products show it" -- a supplier-uploaded COA starts
// unpublished (see CoaDocument.published's doc comment); this is that
// review step. Staff-uploaded ones can be unpublished here too if one
// needs pulling without deleting it outright.
export async function setCoaPublished(productId: string, coaId: string, published: boolean) {
  const { organization } = await requireOrg();
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId: organization.id } });
  if (!product) throw new Error("Not found");
  const coa = await prisma.coaDocument.findFirst({ where: { id: coaId, productId } });
  if (!coa) throw new Error("Not found");
  await prisma.coaDocument.update({ where: { id: coaId }, data: { published } });
  revalidatePath(`/products/${productId}`);
}

// VVG (the ShipStation fulfillment partner -- see /api/shipstation/orders)
// runs their own SKU scheme that doesn't match ours 1:1 (their "RET10" is
// whatever this CRM happens to have as that product's own `sku`, e.g.
// "GP3-10"). Sourced directly from VVGFullPricingStructure.xlsx, the
// pricing sheet VVG themselves sent over -- one row per (product name,
// dose) pair, matched here by name fragment + dose since chemicalName
// spellings drift over time (e.g. "GP-3 (Retatrutide)" before the
// GP->EVLV rename, "EVLV-3" after) in a way an exact string never
// survives. `aliases` lists every name fragment (lowercased) this
// product might appear under; matching is substring-based against the
// dose-stripped, lowercased chemicalName.
const VVG_SKU_TABLE: { aliases: string[]; doseMg: number; vvgSku: string }[] = [
  { aliases: ["aod-9604", "aod 9604", "aod9604"], doseMg: 10, vvgSku: "10AD" },
  { aliases: ["ara-290", "ara 290"], doseMg: 50, vvgSku: "AR90" },
  { aliases: ["bpc+tb-500", "bpc/tb-500", "bpc-tb-500", "bpc157+tb500", "bpc 157+tb 500", "bpc+tb500"], doseMg: 10, vvgSku: "BB10" },
  { aliases: ["bpc+tb-500", "bpc/tb-500", "bpc-tb-500", "bpc157+tb500", "bpc 157+tb 500", "bpc+tb500"], doseMg: 20, vvgSku: "BB20" },
  { aliases: ["bpc+tb-500", "bpc/tb-500", "bpc-tb-500", "bpc157+tb500", "bpc 157+tb 500", "bpc+tb500"], doseMg: 30, vvgSku: "BB30" },
  { aliases: ["bpc-157", "bpc 157"], doseMg: 10, vvgSku: "BPC10" },
  { aliases: ["bpc-157", "bpc 157"], doseMg: 20, vvgSku: "BPC20" },
  { aliases: ["bpc-157", "bpc 157"], doseMg: 5, vvgSku: "BPC5" },
  { aliases: ["cartalax"], doseMg: 20, vvgSku: "CART20" },
  { aliases: ["cerebrolysin"], doseMg: 60, vvgSku: "CBL60" },
  { aliases: ["cagrilintide"], doseMg: 10, vvgSku: "CGL10" },
  { aliases: ["cagrilintide"], doseMg: 20, vvgSku: "CGL20" },
  { aliases: ["cagrilintide"], doseMg: 5, vvgSku: "CGL5" },
  { aliases: ["cjc/ipa", "cjc-ipa", "cjc/ipamorelin", "cjc-1295/ipamorelin", "cjc 1295/ipamorelin"], doseMg: 10, vvgSku: "CP10" },
  { aliases: ["cjc/ipa", "cjc-ipa", "cjc/ipamorelin", "cjc-1295/ipamorelin", "cjc 1295/ipamorelin"], doseMg: 20, vvgSku: "CP20" },
  { aliases: ["ghk-cu", "ghk cu"], doseMg: 50, vvgSku: "GHK50" },
  { aliases: ["glow blend", "glow"], doseMg: 70, vvgSku: "GW70" },
  { aliases: ["humanin"], doseMg: 10, vvgSku: "HU10" },
  { aliases: ["igf-1 lr3", "igf1 lr3", "igf-1lr3"], doseMg: 1, vvgSku: "IGF1" },
  { aliases: ["kpv oral", "kpv-oral"], doseMg: 0.5, vvgSku: "KPVo500" },
  { aliases: ["kpv"], doseMg: 10, vvgSku: "KPV10" },
  { aliases: ["klow blend", "klow"], doseMg: 80, vvgSku: "KW80" },
  { aliases: ["mots-c", "mots c"], doseMg: 10, vvgSku: "MOT10" },
  { aliases: ["mots-c", "mots c"], doseMg: 20, vvgSku: "MOT20" },
  { aliases: ["mots-c", "mots c"], doseMg: 40, vvgSku: "MOT40" },
  { aliases: ["melanotan ii", "melanotan-ii", "melanotan 2", "mt-2", "mt2"], doseMg: 10, vvgSku: "MT-2" },
  { aliases: ["nad+", "nad plus", "nad "], doseMg: 1000, vvgSku: "NAD1000" },
  { aliases: ["nad+", "nad plus", "nad "], doseMg: 500, vvgSku: "NAD500" },
  { aliases: ["oxytocin"], doseMg: 10, vvgSku: "OXY10" },
  { aliases: ["korean pink glutathione", "pink glutathione"], doseMg: 1200, vvgSku: "PG1200" },
  { aliases: ["pt-141", "pt 141"], doseMg: 10, vvgSku: "PT10" },
  { aliases: ["retatrutide", "gp-3", "gp3", "evlv-3", "evlv3"], doseMg: 10, vvgSku: "RET10" },
  { aliases: ["retatrutide", "gp-3", "gp3", "evlv-3", "evlv3"], doseMg: 15, vvgSku: "RET15" },
  { aliases: ["retatrutide", "gp-3", "gp3", "evlv-3", "evlv3"], doseMg: 30, vvgSku: "RET30" },
  { aliases: ["retatrutide", "gp-3", "gp3", "evlv-3", "evlv3"], doseMg: 60, vvgSku: "RET60" },
  { aliases: ["semaglutide", "gp-1", "gp1", "evlv-1", "evlv1"], doseMg: 10, vvgSku: "SEM10" },
  { aliases: ["semaglutide", "gp-1", "gp1", "evlv-1", "evlv1"], doseMg: 5, vvgSku: "SEM5" },
  { aliases: ["selank"], doseMg: 10, vvgSku: "SLK10" },
  { aliases: ["semax"], doseMg: 10, vvgSku: "SMX10" },
  { aliases: ["ss-31", "ss 31"], doseMg: 10, vvgSku: "SS3110" },
  { aliases: ["ss-31", "ss 31"], doseMg: 50, vvgSku: "SS3150" },
  { aliases: ["thymosin alpha-1", "thymosin alpha 1", "ta-1", "ta1"], doseMg: 5, vvgSku: "TA15" },
  { aliases: ["tb-500", "tb 500"], doseMg: 10, vvgSku: "TB10" },
  { aliases: ["tb-500", "tb 500"], doseMg: 20, vvgSku: "TB20" },
  { aliases: ["tb-500", "tb 500"], doseMg: 5, vvgSku: "TB5" },
  { aliases: ["tesamorelin"], doseMg: 10, vvgSku: "TES10" },
  { aliases: ["tesamorelin"], doseMg: 20, vvgSku: "TES20" },
  { aliases: ["tirzepatide", "gp-2", "gp2", "evlv-2", "evlv2"], doseMg: 10, vvgSku: "TIR10" },
  { aliases: ["tirzepatide", "gp-2", "gp2", "evlv-2", "evlv2"], doseMg: 15, vvgSku: "TIR15" },
  { aliases: ["tirzepatide", "gp-2", "gp2", "evlv-2", "evlv2"], doseMg: 30, vvgSku: "TIR30" },
  { aliases: ["tirzepatide", "gp-2", "gp2", "evlv-2", "evlv2"], doseMg: 60, vvgSku: "TIR60" },
  { aliases: ["bacteriostatic water", "bac water", "bac-water"], doseMg: 30, vvgSku: "BAC30" },
];

export interface VvgSkuFixResult {
  matched: { product: string; sku: string; vvgSku: string }[];
  unmatched: { product: string; sku: string }[];
}

// Best-effort auto-match against VVG_SKU_TABLE above; anything it can't
// confidently match (ambiguous dose, a genuinely new product not on
// VVG's sheet yet, a typo in chemicalName) is left alone and surfaced in
// `unmatched` for a human to fill in via the product's own edit page
// rather than guessing wrong on a fulfillment SKU -- a wrong SKU here
// means the wrong vial goes out, which is worse than an empty one (that
// at least falls back to our own `sku` and gets caught by a human
// reading the packing slip).
export async function setVvgFulfillmentSkus(): Promise<VvgSkuFixResult> {
  const { organization } = await requireOrg();

  const products = await prisma.product.findMany({ where: { organizationId: organization.id } });

  const matched: VvgSkuFixResult["matched"] = [];
  const unmatched: VvgSkuFixResult["unmatched"] = [];

  for (const product of products) {
    const dose = doseNumber(product.chemicalName);
    const baseName = stripDoseSuffix(product.chemicalName).toLowerCase();
    const hit =
      dose != null
        ? VVG_SKU_TABLE.find((row) => row.doseMg === dose && row.aliases.some((a) => baseName.includes(a)))
        : undefined;

    if (hit) {
      if (product.fulfillmentSku !== hit.vvgSku) {
        await prisma.product.update({ where: { id: product.id }, data: { fulfillmentSku: hit.vvgSku } });
      }
      matched.push({ product: product.chemicalName, sku: product.sku, vvgSku: hit.vvgSku });
    } else {
      unmatched.push({ product: product.chemicalName, sku: product.sku });
    }
  }

  revalidatePath("/products");
  revalidatePath("/products/fulfillment-skus");

  return { matched, unmatched };
}

export interface VvgCatalogSyncResult {
  updated: { product: string; sku: string; retail?: string; wholesale?: string; stock?: number }[];
  skippedNoPrice: string[];
  unmatched: string[];
  skuConflicts: { vvgSku: string; product: string; conflictingSku: string }[];
}

interface VvgCatalogRow {
  vvgSku: string;
  retailCents: number | null;
  cogsCents: number | null;
  stock: number | null;
}

// Straight from VVG's own 2026-09-09 catalog sheet
// (VVGcataloguploadsheet20260909v5FINALrounded.csv) -- this is VVG's own
// multi-brand (msv/vintage/liberty) product list, not ours, so we only
// pull 3 of its columns per SKU: price_retail (column H, what we charge),
// price_wholesale (column J, our COG), and stock_qty (column G). Rows
// with nothing usable in any of those three (still "TBD"/on order, e.g.
// 5-Amino 1MQ 5mg/10mg) are left out entirely rather than zeroing
// something a human hasn't actually set yet.
const VVG_CATALOG_DATA: VvgCatalogRow[] = [
  { vvgSku: "10AD", retailCents: 6499, cogsCents: 4000, stock: 10 },
  { vvgSku: "AR90", retailCents: 9999, cogsCents: 5000, stock: 0 },
  { vvgSku: "BB10", retailCents: 7499, cogsCents: 2550, stock: 0 },
  { vvgSku: "BB20", retailCents: 10999, cogsCents: 4500, stock: 33 },
  { vvgSku: "BB30", retailCents: 6999, cogsCents: 4900, stock: 50 },
  { vvgSku: "BPC10", retailCents: 4999, cogsCents: 2050, stock: 0 },
  { vvgSku: "BPC20", retailCents: 8999, cogsCents: 3500, stock: 0 },
  { vvgSku: "BPC5", retailCents: 3999, cogsCents: 1400, stock: 0 },
  { vvgSku: "CART20", retailCents: 5999, cogsCents: 3500, stock: 10 },
  { vvgSku: "CBL60", retailCents: 5499, cogsCents: 3000, stock: 10 },
  { vvgSku: "CGL10", retailCents: 6999, cogsCents: 4400, stock: 0 },
  { vvgSku: "CGL20", retailCents: 14999, cogsCents: 6700, stock: 0 },
  { vvgSku: "CGL5", retailCents: 6999, cogsCents: 2900, stock: 0 },
  { vvgSku: "CP10", retailCents: 7499, cogsCents: 2500, stock: 31 },
  { vvgSku: "CP20", retailCents: 12999, cogsCents: 4500, stock: 10 },
  { vvgSku: "GHK50", retailCents: 3999, cogsCents: 1300, stock: 29 },
  { vvgSku: "GW70", retailCents: 13999, cogsCents: 3350, stock: 9 },
  { vvgSku: "HU10", retailCents: 8999, cogsCents: null, stock: 0 },
  { vvgSku: "IGF1", retailCents: 5999, cogsCents: 5300, stock: 0 },
  { vvgSku: "KPV10", retailCents: 3999, cogsCents: 1950, stock: 20 },
  { vvgSku: "KPVo500", retailCents: null, cogsCents: 4000, stock: 0 },
  { vvgSku: "KW80", retailCents: 14999, cogsCents: 5200, stock: 96 },
  { vvgSku: "MOT10", retailCents: 4999, cogsCents: 1600, stock: 25 },
  { vvgSku: "MOT20", retailCents: 5499, cogsCents: 2700, stock: 20 },
  { vvgSku: "MOT40", retailCents: 14999, cogsCents: 4500, stock: 30 },
  { vvgSku: "MT-2", retailCents: 3999, cogsCents: 2050, stock: 0 },
  { vvgSku: "NAD1000", retailCents: 8499, cogsCents: 3200, stock: 0 },
  { vvgSku: "NAD500", retailCents: 6499, cogsCents: 2400, stock: 19 },
  { vvgSku: "OXY10", retailCents: 3999, cogsCents: 2500, stock: 10 },
  { vvgSku: "PG1200", retailCents: 5999, cogsCents: 3000, stock: 25 },
  { vvgSku: "PT10", retailCents: 3999, cogsCents: 1800, stock: 10 },
  { vvgSku: "RET10", retailCents: 7499, cogsCents: 2200, stock: 50 },
  { vvgSku: "RET15", retailCents: 12999, cogsCents: 2950, stock: 24 },
  { vvgSku: "RET30", retailCents: 18999, cogsCents: 5000, stock: 30 },
  { vvgSku: "RET60", retailCents: 34999, cogsCents: 9000, stock: 0 },
  { vvgSku: "SEM10", retailCents: 7499, cogsCents: 1650, stock: 17 },
  { vvgSku: "SEM5", retailCents: 4999, cogsCents: 1300, stock: 20 },
  { vvgSku: "SLK10", retailCents: 4999, cogsCents: 2200, stock: 4 },
  { vvgSku: "SMX10", retailCents: 4999, cogsCents: 1950, stock: 5 },
  { vvgSku: "SS3110", retailCents: 4500, cogsCents: 2250, stock: 10 },
  { vvgSku: "SS3150", retailCents: 11999, cogsCents: 4550, stock: 0 },
  { vvgSku: "TA15", retailCents: 4499, cogsCents: 2300, stock: 10 },
  { vvgSku: "TB10", retailCents: 6999, cogsCents: 3500, stock: 0 },
  { vvgSku: "TB20", retailCents: 12999, cogsCents: 5350, stock: 0 },
  { vvgSku: "TB5", retailCents: 4499, cogsCents: 2300, stock: 0 },
  { vvgSku: "TES10", retailCents: 9499, cogsCents: 4200, stock: 15 },
  { vvgSku: "TES20", retailCents: 14999, cogsCents: 6400, stock: 0 },
  { vvgSku: "TIR10", retailCents: 5999, cogsCents: 1950, stock: 19 },
  { vvgSku: "TIR15", retailCents: 8999, cogsCents: 2500, stock: 30 },
  { vvgSku: "TIR30", retailCents: 14999, cogsCents: 3900, stock: 29 },
  { vvgSku: "TIR60", retailCents: 27499, cogsCents: 6000, stock: 7 },
  { vvgSku: "BAC30", retailCents: 2500, cogsCents: 1700, stock: 46 },
];

// Applies VVG_CATALOG_DATA above to the master catalog: COG (Product.
// cogsCents) from their wholesale column, our own internal `sku` from
// their SKU column, stock (Product.masterStock) from their stock column,
// and storefront price (StoreMapping.storePriceCents, every verified
// brand) from their retail column -- matched to a Product the same
// name+dose way setVvgFulfillmentSkus() above does, since this sheet
// uses the identical SKU scheme. Only touches a field when this sheet
// actually has a value for it (see the null checks in VVG_CATALOG_DATA)
// -- never zeroes a price/stock a human set on purpose just because this
// particular row of VVG's sheet left it blank ("TBD"). Doesn't touch
// StoreMapping.active: whether a product should be for sale at all is a
// separate call (setStorePrice/removeFromStorefront), this only updates
// what it costs if it already is.
export async function applyVvgCatalogSync(): Promise<VvgCatalogSyncResult> {
  const { organization } = await requireOrg();

  const products = await prisma.product.findMany({ where: { organizationId: organization.id } });
  const brands = await prisma.brand.findMany({ where: { organizationId: organization.id, verifiedAt: { not: null } } });

  const result: VvgCatalogSyncResult = { updated: [], skippedNoPrice: [], unmatched: [], skuConflicts: [] };

  for (const row of VVG_CATALOG_DATA) {
    if (row.retailCents == null && row.cogsCents == null && row.stock == null) {
      result.skippedNoPrice.push(row.vvgSku);
      continue;
    }

    const tableEntry = VVG_SKU_TABLE.find((t) => t.vvgSku === row.vvgSku);
    if (!tableEntry) {
      result.unmatched.push(row.vvgSku);
      continue;
    }

    const product = products.find((p) => {
      const dose = doseNumber(p.chemicalName);
      const baseName = stripDoseSuffix(p.chemicalName).toLowerCase();
      return dose === tableEntry.doseMg && tableEntry.aliases.some((a) => baseName.includes(a));
    });

    if (!product) {
      result.unmatched.push(row.vvgSku);
      continue;
    }

    const data: { cogsCents?: number; masterStock?: number; sku?: string } = {};
    if (row.cogsCents != null) data.cogsCents = row.cogsCents;
    if (row.stock != null) data.masterStock = row.stock;

    let skuApplied = product.sku;
    if (product.sku !== row.vvgSku) {
      const conflict = products.find((p) => p.id !== product.id && p.sku === row.vvgSku);
      if (conflict) {
        result.skuConflicts.push({ vvgSku: row.vvgSku, product: product.chemicalName, conflictingSku: conflict.sku });
      } else {
        data.sku = row.vvgSku;
        skuApplied = row.vvgSku;
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.product.update({ where: { id: product.id }, data });
    }

    if (row.retailCents != null && brands.length > 0) {
      for (const brand of brands) {
        const mapping = await prisma.storeMapping.findFirst({ where: { brandId: brand.id, productId: product.id } });
        if (mapping) {
          await prisma.storeMapping.update({ where: { id: mapping.id }, data: { storePriceCents: row.retailCents } });
        }
      }
    }

    result.updated.push({
      product: product.chemicalName,
      sku: skuApplied,
      retail: row.retailCents != null ? `$${(row.retailCents / 100).toFixed(2)}` : undefined,
      wholesale: row.cogsCents != null ? `$${(row.cogsCents / 100).toFixed(2)}` : undefined,
      stock: row.stock ?? undefined,
    });
  }

  revalidatePath("/products");
  revalidatePath("/products/vvg-catalog-sync");

  return result;
}
