import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import { money } from "@/lib/format";
import clsx from "clsx";

export default async function ProductsPage() {
  const { organization } = await requireOrg();

  const products = await prisma.product.findMany({
    where: { organizationId: organization.id },
    include: { storeMappings: { include: { brand: true } }, coas: true },
    orderBy: { sku: "asc" },
  });

  const totalUnits = products.reduce((s, p) => s + p.masterStock, 0);
  const inventoryValue = products.reduce((s, p) => s + p.masterStock * p.cogsCents, 0);
  const outOfStock = products.filter((p) => p.masterStock <= 0).length;
  const totalCoas = products.reduce((s, p) => s + p.coas.length, 0);
  const productsWithCoas = products.filter((p) => p.coas.length > 0).length;

  return (
    <div>
      <PageHeader
        title="Master Products"
        subtitle="Central catalog, COA documents, and product images"
        actions={
          <>
            <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-800 hover:bg-background-100">
              Add product
            </button>
            <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
              Sync all brands
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total SKUs" value={String(products.length)} />
        <StatCard label="Units in stock" value={totalUnits.toLocaleString()} />
        <StatCard label="Inventory value (COGS)" value={money(inventoryValue)} />
        <StatCard
          label="Out of stock"
          value={String(outOfStock)}
          hint={`COA Documents: ${totalCoas} across ${productsWithCoas} products`}
        />
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon="ri-flask-line"
          title="No products yet"
          body="Add your first SKU, or connect a brand's WooCommerce store to import its catalog automatically."
        />
      ) : (
        <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="py-2.5 px-4 font-medium">SKU</th>
                <th className="py-2.5 px-4 font-medium">Chemical name</th>
                <th className="py-2.5 px-4 font-medium text-right">COGS</th>
                <th className="py-2.5 px-4 font-medium text-right">Master stock</th>
                <th className="py-2.5 px-4 font-medium">Store mappings</th>
                <th className="py-2.5 px-4 font-medium text-center">COA</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-background-100 last:border-0">
                  <td className="py-3 px-4 font-mono text-xs text-foreground-800">{p.sku}</td>
                  <td className="py-3 px-4 text-foreground-800">{p.chemicalName}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{money(p.cogsCents)}</td>
                  <td
                    className={clsx(
                      "py-3 px-4 text-right tabular-nums font-medium",
                      p.masterStock <= 0 ? "text-accent-700" : "text-foreground-800"
                    )}
                  >
                    {p.masterStock}
                  </td>
                  <td className="py-3 px-4 text-xs text-foreground-600">
                    {p.storeMappings.map((m) => m.brand.name).join(", ") || "—"}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {p.coas.length > 0 ? (
                      <span className="text-primary-600 text-xs font-medium">{p.coas.length}</span>
                    ) : (
                      <span className="text-foreground-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
