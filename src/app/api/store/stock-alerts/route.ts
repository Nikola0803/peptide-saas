import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const slug = String(body?.productSlug ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !slug) {
    return NextResponse.json({ error: "A valid email and product are required." }, { status: 400 });
  }

  const mapping = await prisma.storeMapping.findFirst({
    where: { brandId: store.brandId, slug },
    select: { productId: true, product: { select: { masterStock: true } } },
  });
  if (!mapping) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  if (mapping.product.masterStock > 0) return NextResponse.json({ error: "This product is already in stock." }, { status: 409 });

  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
    update: {},
    create: { organizationId: store.organizationId, email },
    select: { id: true },
  });
  await prisma.stockAlertSubscription.upsert({
    where: { productId_contactId: { productId: mapping.productId, contactId: contact.id } },
    update: { notifiedAt: null },
    create: { organizationId: store.organizationId, productId: mapping.productId, contactId: contact.id },
  });
  return NextResponse.json({ ok: true });
}
