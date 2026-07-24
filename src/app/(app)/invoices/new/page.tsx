import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { createInvoice } from "../actions";

const BLANK_LINES = 8;

export default async function NewInvoicePage({ searchParams }: { searchParams: { orderId?: string } }) {
  const { organization } = await requireOrg();

  let prefill: {
    customerName: string;
    customerEmail: string;
    brandId: string;
    lines: { description: string; quantity: number; unitPrice: string }[];
  } | null = null;

  if (searchParams.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: searchParams.orderId, organizationId: organization.id },
      include: { items: true, contact: true, brand: true },
    });
    if (order) {
      prefill = {
        customerName: order.shipToName || order.contact?.email || "",
        customerEmail: order.contact?.email ?? "",
        brandId: order.brandId,
        lines: order.items.map((i) => ({
          description: i.name,
          quantity: i.quantity,
          unitPrice: (i.unitPriceCents / 100).toFixed(2),
        })),
      };
    }
  }

  const brands = await prisma.brand.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  const lineSlots = Array.from({ length: Math.max(BLANK_LINES, prefill?.lines.length ?? 0) }, (_, i) => prefill?.lines[i]);

  return (
    <div>
      <PageHeader
        title="New invoice"
        actions={
          <Link href="/invoices" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
            Cancel
          </Link>
        }
      />
      <Card className="p-4 max-w-3xl">
        <form action={createInvoice} className="space-y-4">
          {searchParams.orderId && <input type="hidden" name="orderId" value={searchParams.orderId} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Customer name</label>
              <input
                name="customerName"
                required
                defaultValue={prefill?.customerName}
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Customer email</label>
              <input
                name="customerEmail"
                type="email"
                defaultValue={prefill?.customerEmail}
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-1">Billing address</label>
            <textarea
              name="customerAddress"
              rows={2}
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Brand</label>
              <select
                name="brandId"
                defaultValue={prefill?.brandId}
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              >
                <option value="">—</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">PO number</label>
              <input name="poNumber" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Due date</label>
              <input name="dueDate" type="date" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-2">Line items</label>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_80px_100px] gap-2 text-[11px] text-foreground-500 px-0.5">
                <span>Description</span>
                <span>Qty</span>
                <span>Unit price</span>
              </div>
              {lineSlots.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_100px] gap-2">
                  <input
                    name="lineDescription"
                    defaultValue={line?.description}
                    placeholder="BPC-157 5mg"
                    className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                  />
                  <input
                    name="lineQuantity"
                    type="number"
                    defaultValue={line?.quantity ?? ""}
                    placeholder="1"
                    className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                  />
                  <input
                    name="linePrice"
                    type="number"
                    step="0.01"
                    defaultValue={line?.unitPrice}
                    placeholder="0.00"
                    className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Tax (USD)</label>
              <input
                name="tax"
                type="number"
                step="0.01"
                defaultValue="0.00"
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Notes / terms</label>
              <input name="notes" placeholder="e.g. Net 30" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
            </div>
          </div>

          <button className="text-sm bg-primary-500 text-background-50 rounded-md px-4 py-2 font-medium hover:bg-primary-600">
            Create invoice
          </button>
        </form>
      </Card>
    </div>
  );
}
