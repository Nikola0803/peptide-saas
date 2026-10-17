import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { money } from "@/lib/format";
import { createSupplier, setSupplierActive, saveSupplierSheetUrl } from "./actions";
import { InviteForm } from "./invite-form";

function toSheetCsvUrl(raw: string): string | null {
  try {
    const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) return null;
    const id = m[1];
    // Preserve the gid (tab) if present anywhere in the URL
    const gidMatch = raw.match(/[?&#]gid=(\d+)/);
    const gid = gidMatch ? `&gid=${gidMatch[1]}` : "";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid}`;
  } catch {
    return null;
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQ) { inQ = true; }
      else if (ch === '"' && inQ) {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

async function fetchSheetRows(url: string): Promise<{ headers: string[]; rows: string[][] } | { error: string }> {
  try {
    const csvUrl = toSheetCsvUrl(url);
    if (!csvUrl) return { error: "Invalid Google Sheets URL — paste the sheet's share or edit link." };
    const res = await fetch(csvUrl, { next: { revalidate: 300 } }); // cache 5 min
    if (!res.ok) return { error: `Could not fetch sheet (HTTP ${res.status}). Make sure the sheet is published to the web.` };
    const text = await res.text();
    const all = parseCsv(text);
    if (all.length === 0) return { error: "Sheet appears to be empty." };
    const [headers, ...rows] = all;
    return { headers, rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to fetch sheet." };
  }
}

export default async function SuppliersPage() {
  const { organization } = await requireOrg();

  const [org, suppliers] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { supplierSheetUrl: true } }),
    prisma.supplier.findMany({
      where: { organizationId: organization.id },
      include: {
        products: { where: { active: true } },
        memberships: { include: { user: true } },
        invoices: { where: { status: { not: "PAID" } } },
        _count: { select: { orderItems: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const sheetResult = org.supplierSheetUrl ? await fetchSheetRows(org.supplierSheetUrl) : null;

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Dropshipping partners — their own products, stock, and shipping rates" />

      {/* Price sheet */}
      {org.supplierSheetUrl && (
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground-950">Supplier price sheet</h2>
            <span className="text-[11px] text-foreground-400">Auto-refreshes every 5 min</span>
          </div>
          {!sheetResult ? null : "error" in sheetResult ? (
            <p className="text-xs text-red-600">{sheetResult.error}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-background-200">
                    {sheetResult.headers.map((h, i) => (
                      <th key={i} className="py-2 px-3 font-semibold text-foreground-700 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheetResult.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-background-100 last:border-0 hover:bg-background-100">
                      {sheetResult.headers.map((_, ci) => (
                        <td key={ci} className="py-2 px-3 text-foreground-700 whitespace-nowrap">{row[ci] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-foreground-400">
                {sheetResult.rows.length} rows ·{" "}
                <a href={org.supplierSheetUrl} target="_blank" rel="noreferrer" className="hover:underline text-primary-600">
                  Open in Google Sheets ↗
                </a>
              </p>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {suppliers.length === 0 ? (
            <EmptyState
              icon="ri-truck-line"
              title="No suppliers yet"
              body="Add a dropshipping partner, then invite them a login — they'll manage their own product list, stock, and shipping rates from a restricted view."
            />
          ) : (
            suppliers.map((s) => {
              const login = s.memberships[0]?.user;
              const costTotal = s.products.reduce((sum, p) => sum + p.costCents + p.shippingCents, 0);
              const owed = s.invoices.reduce((sum, i) => sum + i.totalCents, 0);
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link href={`/suppliers/${s.id}`} className="text-sm font-semibold text-foreground-950 hover:underline">
                          {s.name}
                        </Link>
                        <Badge status={s.active ? "connected" : "pending"} />
                      </div>
                      <p className="text-xs text-foreground-500 mt-0.5">{s.contactEmail || "No contact email"}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/suppliers/${s.id}`} className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100">
                        Invoices{owed > 0 ? ` (${money(owed)} owed)` : ""}
                      </Link>
                      <form action={setSupplierActive.bind(null, s.id, !s.active)}>
                        <button className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100">
                          {s.active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-background-200 text-center">
                    <div>
                      <div className="text-sm font-semibold text-foreground-950 tabular-nums">{s.products.length}</div>
                      <div className="text-[10px] text-foreground-500">Active products</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground-950 tabular-nums">{s._count.orderItems}</div>
                      <div className="text-[10px] text-foreground-500">Items fulfilled</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground-950 tabular-nums">{money(costTotal)}</div>
                      <div className="text-[10px] text-foreground-500">Combined cost+ship</div>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-background-200">
                    <p className="text-xs text-foreground-500">
                      {login ? (
                        <>
                          Login: <span className="font-mono text-foreground-800">{login.email}</span>
                        </>
                      ) : (
                        "No login invited yet"
                      )}
                    </p>
                    <InviteForm supplierId={s.id} existingEmail={login?.email} />
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4 h-fit">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Add a supplier</h2>
            <form action={createSupplier} className="space-y-2">
              <input
                name="name"
                required
                placeholder="Supplier name"
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
              <input
                name="contactEmail"
                type="email"
                placeholder="Contact email (optional)"
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
              <button className="w-full text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Add supplier
              </button>
            </form>
          </Card>

          <Card className="p-4 h-fit">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">Price sheet</h2>
            <p className="text-xs text-foreground-500 mb-3">
              Paste a Google Sheets link — the sheet must be published to the web
              (File → Share → Publish to web → CSV).
            </p>
            <form action={saveSupplierSheetUrl} className="space-y-2">
              <input
                name="supplierSheetUrl"
                type="url"
                defaultValue={org.supplierSheetUrl ?? ""}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
              <button className="w-full text-xs bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                {org.supplierSheetUrl ? "Update link" : "Save link"}
              </button>
            </form>
            {org.supplierSheetUrl && (
              <form action={saveSupplierSheetUrl} className="mt-1">
                <input type="hidden" name="supplierSheetUrl" value="" />
                <button className="w-full text-xs border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
                  Remove
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
