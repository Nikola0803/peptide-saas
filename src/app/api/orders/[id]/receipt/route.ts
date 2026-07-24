import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { renderBillingPdf } from "@/lib/billing-pdf";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { organization } = await requireOrg();

  const order = await prisma.order.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: { items: true, brand: true, contact: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderBillingPdf({
    kind: "Receipt",
    documentNumber: `#${order.externalOrderNumber}`,
    brandName: order.brand.name,
    brandDomain: order.brand.domain,
    issueDate: order.placedAt,
    customerName: order.shipToName || order.contact?.email || "Customer",
    customerEmail: order.contact?.email,
    customerAddress: [order.shipToAddress1, order.shipToAddress2, [order.shipToCity, order.shipToState, order.shipToPostalCode].filter(Boolean).join(", "), order.shipToCountry]
      .filter(Boolean)
      .join("\n") || null,
    lines: order.items.map((i) => ({
      description: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      totalCents: i.unitPriceCents * i.quantity,
    })),
    subtotalCents: order.grossCents,
    taxCents: 0,
    totalCents: order.grossCents,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${order.externalOrderNumber}.pdf"`,
    },
  });
}
