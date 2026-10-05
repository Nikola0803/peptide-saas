import { NextRequest, NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SheetRow = { sku: string; status: string; stockStatus: string; stockQty: number };

const DEFAULT_SHEET_ID = "1Omlm--Tn0jgqH6h0Mk8t-4hxSofPgbIo";
const DEFAULT_SHEET_RANGE = "'Inventory'!A:F";
let cachedGoogleToken: { value: string; expiresAt: number } | undefined;

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

function sheetRowsFromMatrix(input: unknown[][]): SheetRow[] {
  const matrix = input.map((row) => row.map((value) => String(value ?? ""))).filter((row) => row.some(Boolean));
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

function sheetRows(csv: string): SheetRow[] {
  return sheetRowsFromMatrix(parseCsv(csv));
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

async function getGoogleServiceToken() {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) return cachedGoogleToken.value;
  const email = process.env.GOOGLE_INVENTORY_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_INVENTORY_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google OAuth returned HTTP ${response.status}`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google OAuth did not return an access token");
  cachedGoogleToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedGoogleToken.value;
}

async function loadStockroomRows(): Promise<{ rows: SheetRow[]; source: string }> {
  const token = await getGoogleServiceToken();
  if (token) {
    const sheetId = process.env.GOOGLE_INVENTORY_SHEET_ID || DEFAULT_SHEET_ID;
    const range = process.env.GOOGLE_INVENTORY_SHEET_RANGE || DEFAULT_SHEET_RANGE;
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Google Sheets API returned HTTP ${response.status}`);
    const data = (await response.json()) as { values?: unknown[][] };
    if (!Array.isArray(data.values)) throw new Error("Google Sheets API returned no inventory rows");
    return { rows: sheetRowsFromMatrix(data.values), source: `google-api:${sheetId}` };
  }

  const sheetUrl = process.env.GOOGLE_SHEETS_CSV_URL;
  if (!sheetUrl) {
    throw new Error("Configure Google service-account credentials or GOOGLE_SHEETS_CSV_URL");
  }
  const response = await fetch(sheetUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}`);
  return { rows: sheetRows(await response.text()), source: "csv-url" };
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
  const brandDomain = (process.env.STOCK_SYNC_BRAND_DOMAIN || "evlvpeptides.com").toLowerCase();

  try {
    const { rows, source } = await loadStockroomRows();
    if (rows.length < 5) throw new Error(`Refusing suspiciously small feed (${rows.length} rows)`);

    const brand = await prisma.brand.findFirst({
      where: { domain: { equals: brandDomain, mode: "insensitive" } },
      select: { id: true, organizationId: true },
    });
    if (!brand) throw new Error(`Brand not found for ${brandDomain}`);
    const products = await prisma.product.findMany({
      // Only mutate products already connected to this storefront. Products
      // belonging to another brand in the same organization must not be
      // zeroed merely because they are absent from EVLV's Stockroom sheet.
      where: {
        organizationId: brand.organizationId,
        storeMappings: { some: { brandId: brand.id } },
      },
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
      source,
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
