import { NextRequest, NextResponse } from "next/server";
import { REFERRAL_REWARD_CENTS } from "@/lib/customer-referral";
import { z } from "zod";
import { resolveHeaderOverride } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { utcDateString } from "@/lib/order-engine";
import { resolveCoupons, evaluateCoupons, getAutoApplyCodes, type CouponCartItem } from "@/lib/coupon-engine";
import { getQuantityUnitPriceCents } from "@/lib/quantity-pricing";
import {
  evaluateGlpPairPromotion,
  GLP_PAIR_PROMOTION_CODE,
  GLP_PAIR_PROMOTION_ID,
  GLP_PAIR_PROMOTION_LABEL,
  type GlpPairPromotionItem,
} from "@/lib/glp-pair-promotion";
import {
  evaluateResearchSetPromotion,
  RESEARCH_SET_PROMOTION_CODE,
  RESEARCH_SET_PROMOTION_ID,
  RESEARCH_SET_PROMOTION_LABEL,
} from "@/lib/research-set-promotion";
import { affiliateDiscountCents } from "@/lib/affiliate-program";

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

  const couponCartItems: CouponCartItem[] = [];
  const promotionItems: GlpPairPromotionItem[] = [];
  let subtotalCents = 0;

  for (const item of parsed.data.items) {
    const quantity = Math.max(1, Math.floor(item.quantity));
    const mapping = await prisma.storeMapping.findFirst({
      where: { brandId: store.brandId, slug: item.slug, active: true },
      include: { product: true },
    });
    if (!mapping || mapping.storePriceCents == null) continue; // ignore unknown lines, same tolerance as checkout would hit later

    const dealActive = mapping.dealDate === utcDateString() && mapping.dealPriceCents != null;
    const retailUnitPriceCents = dealActive ? (mapping.dealPriceCents as number) : mapping.storePriceCents;
    const unitPriceCents = getQuantityUnitPriceCents(retailUnitPriceCents, quantity);

    subtotalCents += unitPriceCents * quantity;
    couponCartItems.push({
      productId: mapping.product.id,
      quantity,
      unitPriceCents,
      cogsCents: mapping.product.cogsCents,
    });
    promotionItems.push({
      slug: item.slug,
      quantity,
      productId: mapping.product.id,
      regularUnitPriceCents: mapping.storePriceCents,
      cogsCents: mapping.product.cogsCents,
    });
  }

  if (couponCartItems.length === 0) {
    return NextResponse.json({ error: "No valid items in cart" }, { status: 422 });
  }

  const [org, brand, wholesale] = await Promise.all([
    prisma.organization.findUnique({ where: { id: store.organizationId } }),
    prisma.brand.findUnique({
      where: { id: store.brandId },
      select: { researchSetActive: true, researchSetStartsAt: true, researchSetEndsAt: true, glpPairActive: true },
    }),
    contactId
      ? prisma.wholesalePartner.findUnique({ where: { contactId }, select: { status: true } })
      : Promise.resolve(null),
  ]);
  const alreadyRedeemed = contactId
    ? Boolean(await prisma.order.findFirst({
        where: {
          organizationId: store.organizationId,
          contactId,
          appliedCouponCodes: { contains: GLP_PAIR_PROMOTION_CODE },
          status: { not: "REFUNDED" },
        },
        select: { id: true },
      }))
    : false;
  const isWholesale = wholesale?.status === "APPROVED";
  const marginPercent = org?.minMarginPercent ?? 30;

  // GLP Pair event — second same-item 70% off. Overridden by glpPairActive flag.
  const glpPromotion = (brand?.glpPairActive ?? true)
    ? evaluateGlpPairPromotion(promotionItems, {
        alreadyRedeemed,
        isWholesale,
        minimumMarginPercent: marginPercent,
      })
    : { applies: false };

  if (glpPromotion.applies && "discountCents" in glpPromotion) {
    return NextResponse.json({
      valid: true,
      discountCents: glpPromotion.discountCents,
      subtotalCents: glpPromotion.subtotalCents,
      totalCents: glpPromotion.totalCents,
      appliedCoupons: [{ code: GLP_PAIR_PROMOTION_CODE, label: GLP_PAIR_PROMOTION_LABEL }],
      automaticPromotion: GLP_PAIR_PROMOTION_ID,
      promotionLabel: GLP_PAIR_PROMOTION_LABEL,
      flooredByMargin: glpPromotion.flooredByMargin,
      maximumDiscountPercent: 35,
      errors: [],
    });
  }

  // Research Set — choose 3+, save 30%.
  const researchSetItems = couponCartItems.map((item) => ({
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    cogsCents: item.cogsCents,
  }));
  const researchSetPromotion = evaluateResearchSetPromotion(researchSetItems, {
    active: brand?.researchSetActive ?? false,
    startsAt: brand?.researchSetStartsAt ?? null,
    endsAt: brand?.researchSetEndsAt ?? null,
    isWholesale,
    minimumMarginPercent: marginPercent,
  });

  if (researchSetPromotion.applies) {
    return NextResponse.json({
      valid: true,
      discountCents: researchSetPromotion.discountCents,
      subtotalCents: researchSetPromotion.subtotalCents,
      totalCents: researchSetPromotion.totalCents,
      appliedCoupons: [{ code: RESEARCH_SET_PROMOTION_CODE, label: RESEARCH_SET_PROMOTION_LABEL }],
      automaticPromotion: RESEARCH_SET_PROMOTION_ID,
      promotionLabel: RESEARCH_SET_PROMOTION_LABEL,
      flooredByMargin: researchSetPromotion.flooredByMargin,
      maximumDiscountPercent: 30,
      errors: [],
    });
  }

  const typedCode = parsed.data.code?.trim();
  if (typedCode) {
    const customerReferral = contactId
      ? await prisma.customerReferral.findUnique({
          where: { friendContactId: contactId },
          include: { referrer: { select: { referralCode: true } } },
        })
      : null;
    const priorOrder = contactId
      ? await prisma.order.findFirst({
          where: { organizationId: store.organizationId, contactId, status: { not: "REFUNDED" } },
          select: { id: true },
        })
      : null;
    const referralMatches = customerReferral?.referrer.referralCode?.toUpperCase() === typedCode.toUpperCase();
    const cogsCents = couponCartItems.reduce((sum, item) => sum + item.cogsCents * item.quantity, 0);
    const maximumReferralDiscount = Math.max(0, subtotalCents - Math.ceil(cogsCents * (1 + (org?.minMarginPercent ?? 30) / 100)));
    if (referralMatches && !customerReferral?.referredOrderId && !priorOrder && maximumReferralDiscount >= REFERRAL_REWARD_CENTS) {
      return NextResponse.json({
        valid: true,
        discountCents: REFERRAL_REWARD_CENTS,
        subtotalCents,
        totalCents: Math.max(0, subtotalCents - REFERRAL_REWARD_CENTS),
        appliedCoupons: [{ code: typedCode.toUpperCase(), label: "$15 friend referral" }],
        promotionLabel: "$15 friend referral",
        flooredByMargin: false,
        maximumDiscountPercent: 30,
        errors: [],
      });
    }

    const affiliate = await prisma.affiliate.findFirst({
      where: {
        organizationId: store.organizationId,
        status: "APPROVED",
        OR: [
          { couponCode: { equals: typedCode, mode: "insensitive" } },
          { slug: { equals: typedCode, mode: "insensitive" } },
        ],
      },
      select: { couponCode: true, customerDiscountPercent: true },
    });
    if (affiliate) {
      const cogsCents = couponCartItems.reduce((sum, item) => sum + item.cogsCents * item.quantity, 0);
      const result = affiliateDiscountCents(
        subtotalCents,
        cogsCents,
        affiliate.customerDiscountPercent,
        org?.minMarginPercent ?? 30,
      );
      return NextResponse.json({
        valid: true,
        discountCents: result.discountCents,
        subtotalCents,
        totalCents: Math.max(0, subtotalCents - result.discountCents),
        appliedCoupons: [{ code: affiliate.couponCode, label: "Partner reward" }],
        promotionLabel: affiliate.customerDiscountPercent > 0 ? `${affiliate.customerDiscountPercent}% partner reward` : "Partner code applied",
        flooredByMargin: result.flooredByMargin,
        maximumDiscountPercent: 30,
        errors: [],
      });
    }
  }

  const autoApplyCodes = await getAutoApplyCodes(store.organizationId, contactId);
  const codes = [
    ...autoApplyCodes,
    ...(parsed.data.code ? [parsed.data.code] : []),
    ...(parsed.data.codes ?? []),
  ];
  if (codes.length === 0) {
    return NextResponse.json({ valid: false, discountCents: 0, subtotalCents, totalCents: subtotalCents, appliedCoupons: [], errors: [] });
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

  const maximumDiscountPercent = wholesale?.status === "APPROVED" ? 40 : 30;
  const evaluation = evaluateCoupons(coupons, couponCartItems, org?.minMarginPercent ?? 30, maximumDiscountPercent);

  return NextResponse.json({
    valid: evaluation.discountCents > 0 || visibleErrors.length === 0,
    discountCents: evaluation.discountCents,
    subtotalCents,
    totalCents: Math.max(0, subtotalCents - evaluation.discountCents),
    appliedCoupons: evaluation.appliedCoupons,
    flooredByMargin: evaluation.flooredByMargin,
    maximumDiscountPercent,
    errors: visibleErrors,
  });
}
