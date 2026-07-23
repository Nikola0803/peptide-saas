import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { money } from "@/lib/format";
import { updateProduct, deleteProduct, addCoaDocument, removeCoaDocument } from "../actions";

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrg();

  const product = await prisma.product.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: { storeMappings: { include: { brand: true } }, coas: true },
  });

  if (!product) notFound();

  const updateWithId = updateProduct.bind(null, product.id);
  const deleteWithId = deleteProduct.bind(null, product.id);
  const addCoaWithId = addCoaDocument.bind(null, product.id);

  return (
    <div>
      <PageHeader
        title={product.chemicalName}
        subtitle={product.sku}
        actions={
          <Link href="/products" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
            Back to Master Products
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Details</h2>
          <form action={updateWithId} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">SKU</label>
              <input
                name="sku"
                defaultValue={product.sku}
                required
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Chemical name</label>
              <input
                name="chemicalName"
                defaultValue={product.chemicalName}
                required
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">COGS (USD)</label>
                <input
                  name="cogs"
                  type="number"
                  step="0.01"
                  defaultValue={(product.cogsCents / 100).toFixed(2)}
                  required
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Master stock</label>
                <input
                  name="masterStock"
                  type="number"
                  defaultValue={product.masterStock}
                  required
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Save changes
              </button>
            </div>
          </form>

          <form action={deleteWithId} className="pt-4 mt-4 border-t border-background-200">
            <p className="text-xs text-foreground-500 mb-2">
              Deleting a product also removes its store mappings and COA documents. Order history referencing it is
              kept, just without a linked catalog row.
            </p>
            <button className="text-xs border border-background-300 rounded-md px-3 py-1.5 text-accent-700 hover:bg-accent-50">
              Delete product
            </button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Store mappings</h2>
            {product.storeMappings.length === 0 ? (
              <p className="text-xs text-foreground-500">
                Not yet mapped to a brand's storefront — this happens automatically the first time a matching SKU
                syncs in from a connected store.
              </p>
            ) : (
              <div className="space-y-2">
                {product.storeMappings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-md border border-background-200 text-sm">
                    <span className="text-foreground-800">{m.brand.name}</span>
                    <span className="text-xs text-foreground-500">
                      {m.storePriceCents != null ? money(m.storePriceCents) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">COA documents</h2>
            <div className="space-y-2 mb-3">
              {product.coas.length === 0 && <p className="text-xs text-foreground-500">None uploaded yet.</p>}
              {product.coas.map((coa) => (
                <div key={coa.id} className="flex items-center justify-between px-3 py-2 rounded-md border border-background-200 text-sm">
                  <a href={coa.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline truncate">
                    {coa.label ?? coa.url}
                  </a>
                  <form action={removeCoaDocument.bind(null, product.id, coa.id)}>
                    <button className="text-xs text-foreground-500 hover:text-accent-700 ml-2">Remove</button>
                  </form>
                </div>
              ))}
            </div>
            <form action={addCoaWithId} className="flex items-center gap-2">
              <input
                name="label"
                placeholder="Label (e.g. Lot 004)"
                className="w-32 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
              />
              <input
                name="url"
                placeholder="Document URL"
                required
                className="flex-1 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
              />
              <button className="text-xs border border-background-300 rounded px-2.5 py-1.5 text-foreground-700 hover:bg-background-100 whitespace-nowrap">
                Add
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
