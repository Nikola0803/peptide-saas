import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { createProduct } from "../actions";

export default function NewProductPage() {
  return (
    <div>
      <PageHeader
        title="Add product"
        subtitle="Add a SKU to the master catalog"
        actions={
          <Link href="/products" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
            Cancel
          </Link>
        }
      />
      <Card className="p-4 max-w-lg">
        <form action={createProduct} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-1">SKU</label>
            <input
              name="sku"
              required
              placeholder="BPC-157-5MG"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-1">Chemical name</label>
            <input
              name="chemicalName"
              required
              placeholder="BPC-157 5mg"
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
                defaultValue="0.00"
                required
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Master stock</label>
              <input
                name="masterStock"
                type="number"
                defaultValue="0"
                required
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
          </div>
          <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
            Create product
          </button>
        </form>
      </Card>
    </div>
  );
}
