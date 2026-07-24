import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { renderBillingPdf } from "@/lib/billing-pdf";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { organization } = await requireOrg();

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: { lineItems: true, brand: true },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderBillingPdf({
    kind: "Invoice",
    documentNumber: invoice.invoiceNumber,
    brandName: invoice.brand?.name ?? organization.name,
    brandDomain: invoice.brand?.domain ?? "",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    poNumber: invoice.poNumber,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerAddress: invoice.customerAddress,
    lines: invoice.lineItems.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      totalCents: l.totalCents,
    })),
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    notes: invoice.notes,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
