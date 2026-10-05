import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SheetRow = { sku: string; status: string; stockStatus: string; stockQty: number };

const normalizedSku = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim()); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

function sheetRows(csv: string): SheetRow[] {
  const matrix = parseCsv(csv).filter((row) => row.some(Boolean));
  if (matrix.length < 2) throw new Error("Sheet appears empty");
  // The current Stockroom export includes two title/blank rows before its
  // actual header. Find the SKU row instead of assuming row 1 is the header.
  const headerIndex = matrix.findIndex((row) => row.some((value) => value.trim().toLowerCase() === "sku"));
  if (headerIndex < 0) throw new Error("Could not find the SKU header row");
  const headers = matrix[headerIndex].map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const column = (...names: string[]) => names.map((name) => headers.indexOf(name.replace(/[^a-z0-9]/g, ""))).find((index) => index >= 0) ?? -1;
  const skuColumn = column("sku");
  const publicationColumn = column("publication_status", "publish_status", "catalog_status");
  const stockStatusColumn = column("stock_status", "availability", "status");
  const quantityColumn = column("stock_qty", "in_stock_vials", "in_stock", "quantity", "qty");
  if ([skuColumn, stockStatusColumn, quantityColumn].some((index) => index < 0)) {
    throw new Error(`Required columns missing. Found: ${headers.join(", ")}`);
  }

  const seen = new Set<string>();
  return matrix.slice(headerIndex + 1).flatMap((columns, rowIndex) => {
    const sku = columns[skuColumn]?.trim();
    if (!sku) return [];
    const key = normalizedSku(sku);
    if (seen.has(key)) throw new Error(`Duplicate SKU ${sku} on row ${rowIndex + headerIndex + 2}`);
    seen.add(key);
    const rawQuantity = columns[quantityColumn]?.trim();
    if (!/^\d+$/.test(rawQuantity || "")) {
      throw new Error(`Invalid stock_qty for ${sku}: ${rawQuantity || "blank"}`);
    }
    return [{
      sku,
      status: publicationColumn >= 0 ? columns[publicationColumn]?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") : "publish",
      stockStatus: columns[stockStatusColumn]?.trim().toLowerCase().replace(/[^a-z0-9]/g, ""),
      stockQty: Number(rawQuantity),
    }];
  });
}

// Stockroom is the inventory authority. A row's quantity and availability are
// applied exactly, and any mapped product missing from the export is disabled.
// This prevents stale CRM products (for example discontinued SKUs) from
// remaining purchasable indefinitely.
export async function GET(req: NextRequest) {
  const suppliedSecret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || suppliedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sheetUrl = process.env.GOOGLE_SHEETS_CSV_URL;
  if (!sheetUrl) return NextResponse.json({ error: "GOOGLE_SHEETS_CSV_URL not configured" }, { status: 500 });
  const brandDomain = (process.env.STOCK_SYNC_BRAND_DOMAIN || "evlvpeptides.com").toLowerCase();

  try {
    const response = await fetch(sheetUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}`);
    const rows = sheetRows(await response.text());
    if (rows.length < 5) throw new Error(`Refusing suspiciously small feed (${rows.length} rows)`);

    const brand = await prisma.brand.findFirst({
      where: { domain: { equals: brandDomain, mode: "insensitive" } },
      select: { id: true, organizationId: true },
    });
    if (!brand) throw new Error(`Brand not found for ${brandDomain}`);
    const products = await prisma.product.findMany({
      where: { organizationId: brand.organizationId },
      select: { id: true, sku: true, masterStock: true },
    });
    const productsBySku = new Map(products.map((product) => [normalizedSku(product.sku), product]));
    const notFound = rows.filter((row) => !productsBySku.has(normalizedSku(row.sku))).map((row) => row.sku);

    const sheetSkuKeys = new Set(rows.map((row) => normalizedSku(row.sku)));
    const applied = await prisma.$transaction(async (tx) => {
      const changes: string[] = [];
      for (const product of products) {
        if (sheetSkuKeys.has(normalizedSku(product.sku))) continue;
        if (product.masterStock !== 0) {
          await tx.product.update({ where: { id: product.id }, data: { masterStock: 0 } });
        }
        await tx.storeMapping.updateMany({
          where: { productId: product.id, brandId: brand.id },
          data: { active: false },
        });
        changes.push(`${product.sku}(qty=0,active=false,reason=missing-from-sheet)`);
      }
      for (const row of rows) {
        const product = productsBySku.get(normalizedSku(row.sku));
        if (!product) continue;
        const nextStock = row.stockQty;
        const active = row.status === "publish" && row.stockStatus === "instock" && nextStock > 0;
        if (nextStock !== product.masterStock) {
          await tx.product.update({ where: { id: product.id }, data: { masterStock: nextStock } });
        }
        await tx.storeMapping.updateMany({
          where: { productId: product.id, brandId: brand.id },
          data: { active },
        });
        changes.push(`${row.sku}(qty=${nextStock},active=${active})`);
      }
      return changes;
    });

    const summary = {
      ok: true,
      authority: "crm",
      brand: brandDomain,
      processed: rows.length,
      changedOrChecked: applied.length,
      notFound: notFound.length ? notFound : undefined,
      timestamp: new Date().toISOString(),
    };
    console.log("[stock-sync]", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[stock-sync] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stock sync failed" },
      { status: 422 },
    );
  }
}
