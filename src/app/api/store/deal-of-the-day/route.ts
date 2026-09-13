import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { utcDateString } from "@/lib/order-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/store/deal-of-the-day — today's Deal of the Day for this
// brand, or null if none is scheduled. dealPriceCents on the matching
// StoreMapping (set from the product page's Deal of the Day card) is the
// SAME price checkout actually charges (see order-engine.ts's
// runCheckout) -- this endpoint exists purely so the storefront can show
// a badge/countdown/crossed-out price, not to compute the discount itself.
export async function GET(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const today = utcDateString();
  const mapping = await prisma.storeMapping.findFirst({
    where: { brandId: store.brandId, active: true, dealDate: today, dealPriceCents: { not: null } },
    include: { product: true },
  });

  if (!mapping || !mapping.slug || mapping.storePriceCents == null) {
    return NextResponse.json(null);
  }

  // Midnight UTC tonight -- the countdown target. Deliberately UTC, not
  // the visitor's local midnight, so the deal flips over at the same
  // instant for everyone and matches exactly when checkout stops
  // honoring dealPriceCents (see utcDateString()).
  const endsAt = new Date(`${today}T00:00:00.000Z`);
  endsAt.setUTCDate(endsAt.getUTCDate() + 1);

  return NextResponse.json({
    slug: mapping.slug,
    name: mapping.product.chemicalName,
    imageUrl: mapping.product.imageUrl ?? undefined,
    dealPriceCents: mapping.dealPriceCents,
    regularPriceCents: mapping.storePriceCents,
    endsAt: endsAt.toISOString(),
  });
}
