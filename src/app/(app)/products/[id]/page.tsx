import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { updateProduct, deleteProduct, addCoaDocument, addCoaDocumentFile, removeCoaDocument, setCoaPublished, setStorePrice, removeFromStorefront, updateProductContent, uploadProductImage } from "../actions";
import { addLot, recallLot, unrecallLot, deleteLot } from "../lot-actions";

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrg();

  const [product, brands, supplierProducts] = await Promise.all([
    prisma.product.findFirst({
      where: { id: params.id, organizationId: organization.id },
      include: {
        storeMappings: { include: { brand: true } },
        coas: { include: { uploadedBySupplier: true }, orderBy: [{ published: "asc" }, { createdAt: "desc" }] },
        lots: { orderBy: { receivedAt: "desc" } },
      },
    }),
    prisma.brand.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } }),
    prisma.supplierProduct.findMany({
      where: { productId: params.id, active: true, supplier: { active: true } },
      include: { supplier: true },
    }),
  ]);

  if (!product) notFound();

  const updateWithId = updateProduct.bind(null, product.id);
  const deleteWithId = deleteProduct.bind(null, product.id);
  const addCoaWithId = addCoaDocument.bind(null, product.id);
  const addCoaFileWithId = addCoaDocumentFile.bind(null, product.id);
  const updateContentWithId = updateProductContent.bind(null, product.id);
  const uploadImageWithId = uploadProductImage.bind(null, product.id);
  const mappedBrandIds = new Set(product.storeMappings.map((m) => m.brandId));
  const unmappedBrands = brands.filter((b) => !mappedBrandIds.has(b.id));

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

        <Card className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground-950 mb-1">Storefront content</h2>
          <p className="text-xs text-foreground-500 mb-3">
            What shows on evlv-site's shop grid and product page for this SKU. Anything left blank falls back to the
            storefront's own static copy for a matching slug, so it's safe to fill these in gradually.
          </p>
          <div className="flex items-start gap-4 mb-4">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="w-24 h-24 object-cover rounded-md border border-background-300 bg-background-50" />
            ) : (
              <div className="w-24 h-24 rounded-md border border-dashed border-background-300 flex items-center justify-center text-[10px] text-foreground-400">
                No photo
              </div>
            )}
            <form action={uploadImageWithId} className="flex-1 space-y-2">
              <label className="block text-xs font-medium text-foreground-600">Product photo</label>
              <input type="file" name="file" accept="image/*" required className="text-xs" />
              <button className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100">
                Upload photo
              </button>
            </form>
          </div>
          <form action={updateContentWithId} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Purity</label>
                <input
                  name="purity"
                  defaultValue={product.purity ?? ""}
                  placeholder="e.g. 99%+"
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Category label</label>
                <input
                  name="categoryLabel"
                  defaultValue={product.categoryLabel ?? ""}
                  placeholder="e.g. Peptide Research"
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Short description</label>
              <input
                name="shortDescription"
                defaultValue={product.shortDescription ?? ""}
                placeholder="One line, shown on product cards"
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Full description</label>
              <textarea
                name="description"
                defaultValue={product.description ?? ""}
                rows={3}
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Storage instructions</label>
                <textarea
                  name="storageInstructions"
                  defaultValue={product.storageInstructions ?? ""}
                  rows={2}
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Reconstitution instructions</label>
                <textarea
                  name="reconstitutionInstructions"
                  defaultValue={product.reconstitutionInstructions ?? ""}
                  rows={2}
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
            </div>
            <div className="pt-1">
              <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Save storefront content
              </button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">Store pricing</h2>
            {supplierProducts.length > 0 && (
              <p className="text-xs text-foreground-500 mb-3">
                Wholesale cost:{" "}
                {supplierProducts.map((sp) => (
                  <span key={sp.id} className="font-medium text-foreground-700">
                    {money(sp.costCents)} ({sp.supplier.name})
                  </span>
                ))}
                {" "}— set your own retail price below, however you want to mark it up.
              </p>
            )}
            {product.storeMappings.length === 0 && unmappedBrands.length === 0 && (
              <p className="text-xs text-foreground-500">No brands on this organization yet.</p>
            )}
            <div className="space-y-3">
              {product.storeMappings.map((m) => (
                <form key={m.id} action={setStorePrice.bind(null, product.id, m.brandId)} className="rounded-md border border-background-200 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-foreground-800">{m.brand.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge status={m.active ? "connected" : "pending"} />
                      {m.active && (
                        <button
                          type="submit"
                          formAction={removeFromStorefront.bind(null, product.id, m.brandId)}
                          className="text-[11px] text-foreground-500 hover:text-red-600"
                          title="Pull this product off this brand's storefront -- it stops showing in the shop and homepage, but stays in your catalog and order history."
                        >
                          Remove from storefront
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      defaultValue={m.storePriceCents != null ? (m.storePriceCents / 100).toFixed(2) : ""}
                      placeholder="Retail price"
                      className="w-24 text-xs border border-background-300 rounded px-2 py-1 bg-background-50"
                    />
                    <input
                      name="slug"
                      defaultValue={m.slug ?? ""}
                      placeholder="slug"
                      className="flex-1 min-w-0 text-xs border border-background-300 rounded px-2 py-1 bg-background-50 font-mono"
                    />
                    <button className="text-xs bg-primary-500 text-background-50 rounded px-2.5 py-1 font-medium hover:bg-primary-600 shrink-0">
                      Save
                    </button>
                  </div>
                </form>
              ))}

              {unmappedBrands.map((b) => (
                <form key={b.id} action={setStorePrice.bind(null, product.id, b.id)} className="rounded-md border border-dashed border-background-300 p-2.5">
                  <p className="text-xs text-foreground-500 mb-1.5">Add to {b.name}'s storefront</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="Retail price"
                      className="w-24 text-xs border border-background-300 rounded px-2 py-1 bg-background-50"
                    />
                    <input
                      name="slug"
                      placeholder={`slug (default: ${product.sku.toLowerCase()})`}
                      className="flex-1 min-w-0 text-xs border border-background-300 rounded px-2 py-1 bg-background-50 font-mono"
                    />
                    <button className="text-xs border border-background-300 rounded px-2.5 py-1 text-foreground-700 hover:bg-background-100 shrink-0">
                      Add
                    </button>
                  </div>
                </form>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">COA documents</h2>
            <div className="space-y-2 mb-3">
              {product.coas.length === 0 && <p className="text-xs text-foreground-500">None uploaded yet.</p>}
              {product.coas.map((coa) => (
                <div key={coa.id} className="flex items-center justify-between px-3 py-2 rounded-md border border-background-200 text-sm">
                  <div className="min-w-0">
                    <a href={coa.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline truncate block">
                      {coa.label ?? coa.url}
                    </a>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {coa.uploadedBySupplier && (
                        <span className="text-[10px] text-foreground-500">Uploaded by {coa.uploadedBySupplier.name}</span>
                      )}
                      <Badge status={coa.published ? "connected" : "pending"} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <form action={setCoaPublished.bind(null, product.id, coa.id, !coa.published)}>
                      <button className="text-xs border border-background-300 rounded px-2 py-1 text-foreground-700 hover:bg-background-100">
                        {coa.published ? "Unpublish" : "Publish"}
                      </button>
                    </form>
                    <form action={removeCoaDocument.bind(null, product.id, coa.id)}>
                      <button className="text-xs text-foreground-500 hover:text-accent-700">Remove</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
            <form action={addCoaFileWithId} className="flex items-center gap-2 mb-2">
              <input
                name="label"
                placeholder="Label (e.g. Lot 004)"
                className="w-32 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
              />
              <input
                name="file"
                type="file"
                accept="application/pdf,image/*"
                required
                className="flex-1 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
              />
              <button className="text-xs bg-primary-500 text-background-50 rounded px-2.5 py-1.5 font-medium hover:bg-primary-600 whitespace-nowrap">
                Upload
              </button>
            </form>
            <details className="text-xs text-foreground-500">
              <summary className="cursor-pointer hover:text-foreground-700">Or paste an existing URL instead</summary>
              <form action={addCoaWithId} className="flex items-center gap-2 mt-2">
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
            </details>
          </Card>
        </div>
      </div>

      <Card className="p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground-950">Batches / lots</h2>
          <p className="text-xs text-foreground-500">
            New orders auto-allocate against the oldest active batch (FIFO) — this is what makes a recall list
            possible if one ever fails testing.
          </p>
        </div>

        {product.lots.length === 0 ? (
          <p className="text-xs text-foreground-500 mb-4">No batches recorded yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {product.lots.map((lot) => (
              <div key={lot.id} className="rounded-md border border-background-200 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground-800">{lot.lotNumber}</span>
                    <Badge status={lot.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    {lot.coaUrl && (
                      <a href={lot.coaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">
                        COA
                      </a>
                    )}
                    {lot.status === "RECALLED" ? (
                      <form action={unrecallLot.bind(null, product.id, lot.id)}>
                        <button className="text-xs text-foreground-500 hover:text-foreground-800">Un-recall</button>
                      </form>
                    ) : (
                      <Link
                        href={`/products/${product.id}/lots/${lot.id}/recall`}
                        className="text-xs text-accent-700 hover:underline"
                      >
                        Recall this batch
                      </Link>
                    )}
                    <form action={deleteLot.bind(null, product.id, lot.id)}>
                      <button className="text-xs text-foreground-400 hover:text-accent-700">Remove</button>
                    </form>
                  </div>
                </div>
                <div className="text-xs text-foreground-500 flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>Received {shortDate(lot.receivedAt)}</span>
                  <span>
                    {lot.quantityRemaining} / {lot.quantityReceived} remaining
                  </span>
                  {lot.expiresAt && <span>Expires {shortDate(lot.expiresAt)}</span>}
                  {lot.status === "RECALLED" && (
                    <Link href={`/products/${product.id}/lots/${lot.id}/recall`} className="text-accent-700 font-medium hover:underline">
                      View recall list →
                    </Link>
                  )}
                </div>
                {lot.recallReason && <p className="text-xs text-accent-700 mt-1">Reason: {lot.recallReason}</p>}
              </div>
            ))}
          </div>
        )}

        <form action={addLot.bind(null, product.id)} className="flex flex-wrap items-end gap-2 pt-3 border-t border-background-200">
          <div>
            <label className="block text-[11px] text-foreground-500 mb-1">Lot number</label>
            <input
              name="lotNumber"
              required
              placeholder="LOT-2026-014"
              className="text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-foreground-500 mb-1">Quantity received</label>
            <input
              name="quantityReceived"
              type="number"
              required
              placeholder="200"
              className="w-24 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
            />
          </div>
          <div>
            <label className="block text-[11px] text-foreground-500 mb-1">COA URL</label>
            <input
              name="coaUrl"
              placeholder="https://..."
              className="w-40 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
            />
          </div>
          <div>
            <label className="block text-[11px] text-foreground-500 mb-1">Expires (optional)</label>
            <input name="expiresAt" type="date" className="text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50" />
          </div>
          <button className="text-xs bg-primary-500 text-background-50 rounded px-2.5 py-1.5 font-medium hover:bg-primary-600">
            Add batch
          </button>
        </form>
      </Card>
    </div>
  );
}
