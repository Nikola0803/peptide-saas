import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { resolveContactFromToken } from "@/lib/store-customer";

// POST /api/store/wholesale/dashboard { token }
// Resolves the Contact from the token, then looks up any linked
// WholesalePartner row. Always 200s with a `status` field -- "NONE"
// covers both "never inquired" and "inquiry submitted but not yet
// linked/approved" (the frontend doesn't distinguish those). See
// WHOLESALE-PARTNER-PORTAL.md.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const contact = await resolveContactFromToken(req, store, raw);
  if (!contact) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const partner = await prisma.wholesalePartner.findUnique({
    where: { contactId: contact.id },
    include: { invoices: { orderBy: { issuedDate: "desc" } } },
  });
  if (!partner || partner.status !== "APPROVED") {
    return NextResponse.json({ status: partner?.status ?? "NONE" });
  }

  const mappings = await prisma.storeMapping.findMany({
    where: {
      brandId: store.brandId,
      active: true,
      slug: { not: null },
      wholesaleCasePriceCents: { not: null },
    },
    include: {
      product: {
        include: { supplierProducts: { where: { active: true, supplier: { active: true } }, take: 1 } },
      },
    },
    orderBy: { product: { chemicalName: "asc" } },
  });

  return NextResponse.json({
    status: "APPROVED",
    businessName: partner.businessName ?? undefined,
    notificationEmail: partner.notificationEmail ?? undefined,
    products: mappings.map((mapping) => {
      const stock = mapping.product.supplierProducts[0]?.stock ?? mapping.product.masterStock;
      return {
        slug: mapping.slug,
        sku: mapping.product.sku,
        name: mapping.product.chemicalName,
        imageUrl: mapping.product.imageUrl ?? undefined,
        caseSize: 10,
        casePriceCents: mapping.wholesaleCasePriceCents,
        availableCases: Math.floor(stock / 10),
      };
    }),
    invoices: partner.invoices.map((inv) => ({
      id: inv.id,
      label: inv.label,
      amountCents: inv.amountCents,
      status: inv.status,
      issuedDate: inv.issuedDate.toISOString(),
      paymentMethod: inv.paymentMethod ?? undefined,
      paymentMemo: inv.paymentMemo ?? undefined,
    })),
  });
}
