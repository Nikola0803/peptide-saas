import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { setSupplierProduct, setSupplierProductActive } from "./actions";
import { ImportForm } from "./import-form";

export default async function DropshipProductsPage() {
  const { supplier } = await requireSupplier();

  const products = await prisma.supplierProduct.findMany({
    where: { supplierId: supplier.id },
    include: { product: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader title="Your products" subtitle="What you have in stock, your cost, and your shipping rate per unit" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {products.length === 0 ? (
            <EmptyState
              icon="ri-flask-line"
              title="No products yet"
              body='Add a product by SKU, or bulk-import a CSV with columns: sku, cost, shipping, stock.'
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">SKU</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                    <th className="px-4 py-2.5 font-medium text-right">Shipping</th>
                    <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((sp) => (
                    <tr key={sp.id} className="border-b border-background-100 last:border-0">
                      <td className="px-4 py-2.5 text-foreground-900">{sp.product.chemicalName}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground-600">{sp.product.sku}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(sp.costCents)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(sp.shippingCents)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {sp.stock}
                        {sp.stock === 0 && (sp.restockNote || sp.restockEta) && (
                          <div className="text-[10px] text-foreground-500 font-normal">
                            {sp.restockEta ? `Restocking ${shortDate(sp.restockEta)}` : sp.restockNote}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge status={sp.active ? "connected" : "pending"} />
                      </td>
                      <td className="px-4 py-2.5">
                        <form action={setSupplierProductActive.bind(null, sp.id, !sp.active)}>
                          <button className="text-xs border border-background-300 rounded-md px-2 py-1 text-foreground-700 hover:bg-background-100">
                            {sp.active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Add / update a product</h2>
            <form action={setSupplierProduct} className="space-y-2">
              <input name="sku" required placeholder="SKU" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 font-mono" />
              <input name="name" placeholder="Product name (only needed for a new SKU)" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
              <input name="cost" required type="number" step="0.01" min="0.01" placeholder="Your cost, $" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
              <input name="shipping" type="number" step="0.01" min="0" placeholder="Shipping rate, $" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
              <input name="stock" type="number" step="1" min="0" placeholder="Stock on hand" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
              <div>
                <label className="block text-[11px] text-foreground-500 mb-1">If out of stock — restock note / ETA</label>
                <input name="restockNote" placeholder="e.g. Reordered from manufacturer" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 mb-1.5" />
                <input name="restockEta" type="date" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
              </div>
              <button className="w-full text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Save
              </button>
            </form>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">Bulk import</h2>
            <p className="text-xs text-foreground-500 mb-3">
              CSV with header row: <code className="font-mono">sku,wholesale,name,mg,shipping,stock</code> — only sku
              and wholesale are required. Unknown SKUs get added to the master catalog automatically.
            </p>
            <ImportForm />
          </Card>
        </div>
      </div>
    </div>
  );
}
