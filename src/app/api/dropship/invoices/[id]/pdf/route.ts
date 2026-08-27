import { NextRequest, NextResponse } from "next/server";
import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { renderBillingPdf } from "@/lib/billing-pdf";

// GET /api/dropship/invoices/[id]/pdf — lets a supplier download a PDF of
// one of his own auto-generated invoices. Reuses the same renderer as the
// staff-facing customer invoice PDF (billing-pdf.tsx); "customer" here is
// just the supplier receiving the bill, not a shopper.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { supplier, organization } = await requireSupplier();

  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: params.id, supplierId: supplier.id },
    include: { lineItems: { include: { orderItem: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderBillingPdf({
    kind: "Invoice",
    documentNumber: invoice.id.slice(-8).toUpperCase(),
    brandName: organization.name,
    brandDomain: "",
    issueDate: invoice.createdAt,
    customerName: supplier.name,
    customerEmail: supplier.contactEmail,
    lines: invoice.lineItems.map((l) => ({
      description: l.orderItem.name,
      quantity: l.orderItem.quantity,
      unitPriceCents: l.orderItem.quantity > 0 ? Math.round(l.costCents / l.orderItem.quantity) : l.costCents,
      totalCents: l.costCents + l.shippingCents,
    })),
    subtotalCents: invoice.totalCents,
    taxCents: 0,
    totalCents: invoice.totalCents,
    status: invoice.status,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.id.slice(-8)}.pdf"`,
    },
  });
}
