import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimal CSV parser that handles double-quoted fields (including fields
// containing commas). Good enough for a well-formed Sheets export.
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      fields.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// GET /api/cron/sync-stock?secret=<CRON_SECRET>
// Fetches the Google Sheet CSV export, syncs stock levels and storefront
// visibility for every product row. Safe to call repeatedly — idempotent.
//
// Required env vars:
//   GOOGLE_SHEETS_CSV_URL  — sheet export URL ending in /export?format=csv
//   CRON_SECRET            — arbitrary string; must match ?secret= param
//
// Expected sheet columns (order doesn't matter, matched by header name):
//   sku | status (publish/private) | stock_status (instock/outofstock) | stock_qty
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sheetUrl = process.env.GOOGLE_SHEETS_CSV_URL;
  if (!sheetUrl) {
    return NextResponse.json({ error: "GOOGLE_SHEETS_CSV_URL not configured" }, { status: 500 });
  }

  let csv: string;
  try {
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csv = await res.text();
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch sheet: ${err}` }, { status: 502 });
  }

  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return NextResponse.json({ error: "Sheet appears empty" }, { status: 422 });
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const col = (name: string) => headers.indexOf(name);

  const iSku         = col("sku");
  const iStatus      = col("status");        // publish / private
  const iStockStatus = col("stock_status");  // instock / outofstock
  const iStockQty    = col("stock_qty");     // integer

  if (iSku === -1 || iStockQty === -1) {
    return NextResponse.json(
      { error: `Required columns missing. Found: ${headers.join(", ")}` },
      { status: 422 }
    );
  }

  const updated: string[] = [];
  const unchanged: string[] = [];
  const notFound: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVLine(lines[i]);

    const sku         = cols[iSku]?.trim();
    const status      = iStatus >= 0 ? cols[iStatus]?.trim().toLowerCase() : "publish";
    const stockStatus = iStockStatus >= 0 ? cols[iStockStatus]?.trim().toLowerCase() : "";
    const stockQty    = Math.max(0, parseInt(cols[iStockQty]?.trim() || "0", 10));

    if (!sku) continue;

    // A product is visible on the storefront only when it's published AND
    // marked instock AND actually has quantity. Any other combination hides it.
    const active = status === "publish" && stockStatus === "instock" && stockQty > 0;

    const product = await prisma.product.findFirst({
      where: { sku },
      select: { id: true, masterStock: true },
    });

    if (!product) {
      notFound.push(sku);
      continue;
    }

    const mappings = await prisma.storeMapping.findMany({
      where: { productId: product.id },
      select: { id: true, active: true },
    });
    const alreadyActive = mappings.every((m) => m.active === active);

    if (product.masterStock === stockQty && alreadyActive) {
      unchanged.push(sku);
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { masterStock: stockQty },
    });

    if (mappings.length > 0) {
      await prisma.storeMapping.updateMany({
        where: { productId: product.id },
        data: { active },
      });
    }

    updated.push(`${sku}(qty=${stockQty},active=${active})`);
  }

  const summary = {
    ok: true,
    ts: new Date().toISOString(),
    updated: updated.length,
    unchanged: unchanged.length,
    notFound: notFound.length > 0 ? notFound : undefined,
    changes: updated.length > 0 ? updated : undefined,
  };

  console.log("[stock-sync]", JSON.stringify(summary));
  return NextResponse.json(summary);
}
