import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveHeaderOverride } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { utcDateString } from "@/lib/order-engine";
import { resolveCoupons, evaluateCoupons, type CouponCartItem } from "@/lib/coupon-engine";

const bodySchema = z.object({
  items: z.array(z.object({ slug: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  code: z.string().optional(),
  codes: z.array(z.string()).optional(),
});

// POST /api/store/coupons/validate — a dry-run preview for the storefront's
// checkout/cart page: given the cart and one or more coupon codes, returns
// exactly what runCheckout() in order-engine.ts would apply, without
// creating an order, touching stock, or bumping redemptionCount. Same
// resolveCoupons()/evaluateCoupons() calls as the real checkout path, so
// this can never show a discount that checkout then refuses to honor.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const codes = [
    ...(parsed.data.code ? [parsed.data.code] : []),
    ...(parsed.data.codes ?? []),
  ];
  if (codes.length === 0) {
    return NextResponse.json({ error: "No coupon code provided" }, { status: 400 });
  }

  const couponCartItems: CouponCartItem[] = [];
  let subtotalCents = 0;

  for (const item of parsed.data.items) {
    const quantity = Math.max(1, Math.floor(item.quantity));
    const mapping = await prisma.storeMapping.findFirst({
      where: { brandId: store.brandId, slug: item.slug, active: true },
      include: { product: true },
    });
    if (!mapping || mapping.storePriceCents == null) continue; // ignore unknown lines, same tolerance as checkout would hit later

    const dealActive = mapping.dealDate === utcDateString() && mapping.dealPriceCents != null;
    const unitPriceCents = dealActive ? (mapping.dealPriceCents as number) : mapping.storePriceCents;

    subtotalCents += unitPriceCents * quantity;
    couponCartItems.push({
      productId: mapping.product.id,
      quantity,
      unitPriceCents,
      cogsCents: mapping.product.cogsCents,
    });
  }

  if (couponCartItems.length === 0) {
    return NextResponse.json({ error: "No valid items in cart" }, { status: 422 });
  }

  const { coupons, errors: resolveErrors } = await resolveCoupons(store.organizationId, codes, subtotalCents);

  if (coupons.length === 0) {
    return NextResponse.json({
      valid: false,
      discountCents: 0,
      subtotalCents,
      totalCents: subtotalCents,
      appliedCoupons: [],
      errors: resolveErrors,
    });
  }

  const org = await prisma.organization.findUnique({ where: { id: store.organizationId } });
  const evaluation = evaluateCoupons(coupons, couponCartItems, org?.minMarginPercent ?? 30);

  return NextResponse.json({
    valid: evaluation.discountCents > 0 || resolveErrors.length === 0,
    discountCents: evaluation.discountCents,
    subtotalCents,
    totalCents: Math.max(0, subtotalCents - evaluation.discountCents),
    appliedCoupons: evaluation.appliedCoupons,
    flooredByMargin: evaluation.flooredByMargin,
    errors: resolveErrors,
  });
}
