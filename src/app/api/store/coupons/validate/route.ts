import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveHeaderOverride } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { utcDateString } from "@/lib/order-engine";
import { resolveCoupons, evaluateCoupons, getAutoApplyCodes, type CouponCartItem } from "@/lib/coupon-engine";

const bodySchema = z.object({
  items: z.array(z.object({ slug: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  code: z.string().optional(),
  codes: z.array(z.string()).optional(),
  // When the storefront knows who's checking out (logged in, or entered
  // their email at checkout), pass it so a personal/lifetime-deal coupon
  // assigned to this exact customer (Coupon.assignedContactId) is detected
  // and previewed automatically -- no code needs to be typed for that one.
  customerEmail: z.string().email().optional(),
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

  let contactId: string | undefined;
  if (parsed.data.customerEmail) {
    const contact = await prisma.contact.findUnique({
      where: { organizationId_email: { organizationId: store.organizationId, email: parsed.data.customerEmail.toLowerCase().trim() } },
      select: { id: true },
    });
    contactId = contact?.id;
  }

  const autoApplyCodes = await getAutoApplyCodes(store.organizationId, contactId);
  const codes = [
    ...autoApplyCodes,
    ...(parsed.data.code ? [parsed.data.code] : []),
    ...(parsed.data.codes ?? []),
  ];
  if (codes.length === 0) {
    return NextResponse.json({ valid: false, discountCents: 0, appliedCoupons: [], errors: [] });
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

  const { coupons, errors: resolveErrors } = await resolveCoupons(store.organizationId, codes, subtotalCents, contactId);

  // Auto-apply codes that didn't resolve (e.g. already used up) shouldn't
  // surface as a visible "error" to the customer -- they never typed
  // anything for those, so there's nothing for them to fix. Only codes the
  // customer actually entered themselves get shown as an error.
  const typedCodes = new Set(
    [...(parsed.data.code ? [parsed.data.code] : []), ...(parsed.data.codes ?? [])].map((c) => c.trim().toUpperCase())
  );
  const visibleErrors = resolveErrors.filter((e) => typedCodes.has(e.code.trim().toUpperCase()));

  if (coupons.length === 0) {
    return NextResponse.json({
      valid: false,
      discountCents: 0,
      subtotalCents,
      totalCents: subtotalCents,
      appliedCoupons: [],
      errors: visibleErrors,
    });
  }

  const org = await prisma.organization.findUnique({ where: { id: store.organizationId } });
  const evaluation = evaluateCoupons(coupons, couponCartItems, org?.minMarginPercent ?? 30);

  return NextResponse.json({
    valid: evaluation.discountCents > 0 || visibleErrors.length === 0,
    discountCents: evaluation.discountCents,
    subtotalCents,
    totalCents: Math.max(0, subtotalCents - evaluation.discountCents),
    appliedCoupons: evaluation.appliedCoupons,
    flooredByMargin: evaluation.flooredByMargin,
    errors: visibleErrors,
  });
}
