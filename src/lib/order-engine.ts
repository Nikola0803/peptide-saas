import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { sendTemplate, escapeHtml } from "@/lib/email";
import { pushNotifyNewOrder } from "@/lib/push-notify";
import { resolveCoupons, evaluateCoupons, getAutoApplyCodes, type CouponCartItem } from "@/lib/coupon-engine";
import { getQuantityUnitPriceCents } from "@/lib/quantity-pricing";
import {
  evaluateGlpPairPromotion,
  GLP_PAIR_PROMOTION_CODE,
  type GlpPairPromotionItem,
} from "@/lib/glp-pair-promotion";
import {
  evaluateResearchSetPromotion,
  RESEARCH_SET_PROMOTION_CODE,
} from "@/lib/research-set-promotion";
import { affiliateDiscountCents } from "@/lib/affiliate-program";
import { REFERRAL_REWARD_CENTS } from "@/lib/customer-referral";
import { JOIN25_PREFIX } from "@/lib/welcome-coupon";
import { evaluateHalloweenBogo, evlvHalloweenPromotionOptions, halloweenPromotionIsLive, HALLOWEEN_BOGO_PROMOTION_CODE } from "@/lib/halloween-bogo-promotion";

// "YYYY-MM-DD" in UTC -- the calendar day used to decide whether a
// StoreMapping's Deal of the Day is currently active and to bucket
// GiveawayEntry rows, so a deal/giveaway always flips over at the same
// instant everywhere regardless of server or visitor timezone.
export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// Flat-rate assumption for a card processor fee — matches the WooCommerce
// webhook ingestion path in src/app/api/webhooks/woocommerce/route.ts. Not
// actually charged here (storefront checkout is pay-by-memo, see below),
// kept only so netProfitCents stays comparable across both order sources.
const MERCHANT_FEE_PERCENT = 2.9;
const MERCHANT_FEE_FIXED_CENTS = 30;
const FLAT_SHIPPING_CENTS = 1500;
const FREE_SHIPPING_THRESHOLD_CENTS = 30000;

export interface CheckoutItemInput {
  slug: string;
  quantity: number;
}

export interface CheckoutBillingInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface CheckoutInput {
  items: CheckoutItemInput[];
  customerEmail: string;
  // Wholesale status alone must not force every purchase from this email
  // into 10-vial case pricing. The storefront sets this only when the cart
  // was built from the approved wholesale catalogue.
  wholesaleCheckout?: boolean;
  customerName?: string;
  couponCode?: string;
  // Real price-discount coupon code(s) -- separate from couponCode above,
  // which is an Affiliate attribution code and never changes price (see
  // the doc comment on Order.couponCode in schema.prisma). A single
  // string is normalized to a one-element array in runCheckout().
  discountCodes?: string[];
  // Which rail (cashapp/zelle/venmo/...) plus the reference the customer
  // says they'll pay with — there's no real-time card capture on this
  // path, so the order lands as ON_HOLD until staff reconciles the memo
  // against the payment rail.
  paymentMethod?: string;
  paymentMemo?: string;
  // Accepted for storefront API compatibility, but intentionally ignored.
  // Shipping is calculated from the server-authoritative discounted total.
  shippingCents?: number;
  customerNote?: string;
  // evlv-site's checkout sends the customer/shipping address as a flat
  // "billing" object (firstName/lastName/zip, no address book concept) —
  // this is the real shape, kept separate from the more general `shipTo`
  // below for anything that already sends that instead.
  billing?: CheckoutBillingInput;
  shipTo?: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  // From the checkout request itself (see /api/store/checkout), for basic
  // fraud review — not sent by the storefront, captured server-side.
  ipAddress?: string;
  userAgent?: string;
}

const FRAUD_VELOCITY_WINDOW_HOURS = 24;
const FRAUD_VELOCITY_THRESHOLD = 3; // this many ON_HOLD/PROCESSING orders from one IP in the window auto-flags

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMPTY_CART"
      | "UNKNOWN_PRODUCT"
      | "OUT_OF_STOCK"
      | "WHOLESALE_CASE_QUANTITY"
      | "WHOLESALE_PRICE_UNAVAILABLE",
    public readonly detail?: unknown
  ) {
    super(message);
  }
}

export interface CheckoutResult {
  // `id` / `number` are what evlv-site's checkout page actually reads off
  // the response (`data.number || data.id`) to know the order landed for
  // real instead of silently falling back to a local-only fake order —
  // orderId/externalOrderNumber are kept as aliases for any other caller.
  id: string;
  number: string;
  orderId: string;
  externalOrderNumber: string;
  grossCents: number;
  shippingCents: number;
  status: string;
}

/**
 * The storefront-facing counterpart to processOrder() in the WooCommerce
 * webhook route: same shape (resolve items → decrement stock/lots →
 * attribute affiliate → create Order+OrderItems in one transaction) but
 * items are resolved by StoreMapping.slug + brandId (what evlv-site's
 * static catalog references) instead of by SKU from a Woo payload, and
 * price comes from StoreMapping.storePriceCents (the CRM's source of
 * truth for a headless store) rather than a Woo line-item total.
 */
export async function runCheckout(
  organizationId: string,
  brandId: string,
  input: CheckoutInput
): Promise<CheckoutResult> {
  if (!input.items?.length) {
    throw new CheckoutError("Cart is empty", "EMPTY_CART");
  }

  const { result, contactEmail, contactName, resolvedItems, grossCentsTotal, shippingCents } = await prisma.$transaction(async (tx) => {
    const email = input.customerEmail.toLowerCase().trim();

    const contact = await tx.contact.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: input.customerName ? { name: input.customerName } : {},
      create: { organizationId, email, name: input.customerName },
    });
    await tx.contactBrandLink.upsert({
      where: { contactId_brandId: { contactId: contact.id, brandId } },
      update: {},
      create: { contactId: contact.id, brandId },
    });

    const [org, brand, wholesale, priorPromotionOrder, customerReferral, priorCustomerOrder, referralCodeOwner] = await Promise.all([
      tx.organization.findUnique({ where: { id: organizationId } }),
      tx.brand.findUnique({
        where: { id: brandId },
        select: { slug: true, domain: true, researchSetActive: true, researchSetStartsAt: true, researchSetEndsAt: true, glpPairActive: true, halloweenBogoActive: true, halloweenStartsAt: true, halloweenEndsAt: true, halloweenFreeShippingCents: true },
      }),
      tx.wholesalePartner.findUnique({ where: { contactId: contact.id }, select: { status: true } }),
      tx.order.findFirst({
        where: {
          organizationId,
          contactId: contact.id,
          appliedCouponCodes: { contains: GLP_PAIR_PROMOTION_CODE },
          status: { not: "REFUNDED" },
        },
        select: { id: true },
      }),
      tx.customerReferral.findUnique({
        where: { friendContactId: contact.id },
        select: { id: true, referrerContactId: true, referredOrderId: true },
      }),
      tx.order.findFirst({
        where: { organizationId, contactId: contact.id, status: { not: "REFUNDED" } },
        select: { id: true },
      }),
      input.couponCode
        ? tx.contact.findFirst({
            where: { organizationId, referralCode: { equals: input.couponCode, mode: "insensitive" } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    let grossCentsTotal = 0;
    let cogsCentsTotal = 0;
    const resolvedItems: {
      productId: string;
      sku: string;
      name: string;
      quantity: number;
      unitPriceCents: number;
      lotId?: string;
      supplierId?: string;
    }[] = [];
    const couponCartItems: CouponCartItem[] = [];
    const promotionItems: GlpPairPromotionItem[] = [];
    // ZOONETICS and EVLV are fulfilled as always-available catalogs —
    // inventory counts must never block or be decremented by their orders.
    const bypassInventory =
      brand?.slug.toLowerCase() === "zoonetics" ||
      brand?.domain.toLowerCase().replace(/^www\./, "") === "zoonetics.co" ||
      brand?.slug.toLowerCase() === "evlv" ||
      brand?.domain.toLowerCase().replace(/^www\./, "") === "evlvpeptides.com";

    const isWholesale = input.wholesaleCheckout === true && wholesale?.status === "APPROVED";

    for (const item of input.items) {
      const quantity = Math.max(1, Math.floor(item.quantity));
      const mapping = await tx.storeMapping.findFirst({
        where: { brandId, slug: item.slug, active: true },
        include: { product: true },
      });
      if (!mapping || mapping.storePriceCents == null) {
        throw new CheckoutError(`Unknown or unpriced product: ${item.slug}`, "UNKNOWN_PRODUCT", { slug: item.slug });
      }
      const product = mapping.product;

      if (isWholesale && quantity % 10 !== 0) {
        throw new CheckoutError(
          `Wholesale quantities must be ordered in 10-vial cases: ${item.slug}`,
          "WHOLESALE_CASE_QUANTITY",
          { slug: item.slug, caseSize: 10 },
        );
      }
      if (isWholesale && mapping.wholesaleCasePriceCents == null) {
        throw new CheckoutError(
          `Wholesale case pricing is not available for ${item.slug}`,
          "WHOLESALE_PRICE_UNAVAILABLE",
          { slug: item.slug },
        );
      }
      if (isWholesale && (mapping.wholesaleCasePriceCents as number) % 10 !== 0) {
        throw new CheckoutError(
          `Wholesale case pricing is invalid for ${item.slug}`,
          "WHOLESALE_PRICE_UNAVAILABLE",
          { slug: item.slug },
        );
      }

      // Dropshipping — if a supplier currently lists this product as
      // in-stock, this item is theirs to fulfill; sticks with the item
      // permanently even if the SupplierProduct row changes later (see
      // OrderItem.supplierId's doc comment in schema.prisma). Resolved
      // before the stock check because a dropshipped product's real
      // availability is HIS stock count, not Product.masterStock (which
      // is 0 for anything EVLV never physically holds — see
      // src/lib/supplier-import.ts) — checking masterStock here would
      // make every dropshipped item permanently "out of stock".
      const supplierProduct = await tx.supplierProduct.findFirst({
        where: { productId: product.id, active: true, supplier: { active: true } },
      });

      const availableStock = supplierProduct ? supplierProduct.stock : product.masterStock;
      if (!bypassInventory && availableStock < quantity) {
        throw new CheckoutError(`Insufficient stock for ${product.sku}`, "OUT_OF_STOCK", {
          slug: item.slug,
          available: availableStock,
        });
      }

      // Deal of the Day: if this mapping has a deal scheduled for today,
      // that IS the real price -- not just a display discount (see the
      // dealPriceCents/dealDate doc comment in schema.prisma).
      const dealActive = mapping.dealDate === utcDateString() && mapping.dealPriceCents != null;
      const retailUnitPriceCents = dealActive ? (mapping.dealPriceCents as number) : mapping.storePriceCents;
      const unitPriceCents = isWholesale
        ? (mapping.wholesaleCasePriceCents as number) / 10
        : getQuantityUnitPriceCents(retailUnitPriceCents, quantity);
      grossCentsTotal += unitPriceCents * quantity;
      cogsCentsTotal += product.cogsCents * quantity;

      // "Stock locked until payment confirmed": whichever pool actually
      // covers this item gets decremented now, at order time, not at
      // shipment time — released back by src/lib/stock-release-job.ts if
      // the order is never paid.
      if (!bypassInventory) {
        if (supplierProduct) {
          await tx.supplierProduct.update({ where: { id: supplierProduct.id }, data: { stock: { decrement: quantity } } });
        } else {
          await tx.product.update({ where: { id: product.id }, data: { masterStock: { decrement: quantity } } });
        }
      }

      // FIFO batch allocation, same as the WooCommerce ingestion path — see
      // that file's comment for why this is what makes a recall list
      // possible later. Dropshipped products typically have no lots
      // recorded (EVLV never receives the physical batch), so this is a
      // no-op for them.
      let lotId: string | undefined;
      if (!bypassInventory) {
        const lot = await tx.productLot.findFirst({
          where: { productId: product.id, status: "ACTIVE", quantityRemaining: { gt: 0 } },
          orderBy: { receivedAt: "asc" },
        });
        if (lot) {
          lotId = lot.id;
          const remaining = lot.quantityRemaining - quantity;
          await tx.productLot.update({
            where: { id: lot.id },
            data: { quantityRemaining: Math.max(remaining, 0), status: remaining <= 0 ? "DEPLETED" : "ACTIVE" },
          });
        }
      }

      resolvedItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.chemicalName,
        quantity,
        unitPriceCents,
        lotId,
        supplierId: supplierProduct?.supplierId,
      });
      couponCartItems.push({ productId: product.id, quantity, unitPriceCents, cogsCents: product.cogsCents });
      promotionItems.push({
        slug: item.slug,
        quantity,
        productId: product.id,
        regularUnitPriceCents: mapping.storePriceCents,
        cogsCents: product.cogsCents,
      });
    }

    const marginPercent = org?.minMarginPercent ?? 30;
    const autoApplyCodes = await getAutoApplyCodes(organizationId, contact.id);
    const join25Codes = autoApplyCodes.filter((code) => code.toUpperCase().startsWith(JOIN25_PREFIX));
    const halloweenWindow = evlvHalloweenPromotionOptions({
      active: brand?.halloweenBogoActive ?? false,
      startsAt: brand?.halloweenStartsAt,
      endsAt: brand?.halloweenEndsAt,
      brandDomain: brand?.domain,
    });
    const halloweenPromotion = evaluateHalloweenBogo(couponCartItems, {
      ...halloweenWindow,
      isWholesale,
    });
    const hasExclusiveJoin25 = join25Codes.length > 0 && !halloweenPromotion.applies;

    const glpPromotion = !hasExclusiveJoin25 && !halloweenPromotion.applies && (brand?.glpPairActive ?? true)
      ? evaluateGlpPairPromotion(promotionItems, {
          alreadyRedeemed: Boolean(priorPromotionOrder),
          isWholesale,
          minimumMarginPercent: marginPercent,
        })
      : { applies: false as const };

    // This event is exclusive: regular unit prices replace Deal of the Day
    // and quantity-tier prices, so the third and later units stay full price.
    if (glpPromotion.applies && "subtotalCents" in glpPromotion) {
      grossCentsTotal = glpPromotion.subtotalCents;
      for (let i = 0; i < resolvedItems.length; i += 1) {
        resolvedItems[i].unitPriceCents = promotionItems[i].regularUnitPriceCents;
        couponCartItems[i].unitPriceCents = promotionItems[i].regularUnitPriceCents;
      }
    }

    // Research Set — choose 3+, save 30%. Evaluated after GLP so a qualifying
    // GLP pair cart never also triggers the set discount.
    const researchSetItems = couponCartItems.map((item) => ({
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      cogsCents: item.cogsCents,
    }));
    const researchSetPromotion = !hasExclusiveJoin25 && !halloweenPromotion.applies && !glpPromotion.applies
      ? evaluateResearchSetPromotion(researchSetItems, {
          active: brand?.researchSetActive ?? false,
          startsAt: brand?.researchSetStartsAt ?? null,
          endsAt: brand?.researchSetEndsAt ?? null,
          isWholesale,
          minimumMarginPercent: marginPercent,
        })
      : { applies: false as const };

    const promotion = halloweenPromotion.applies ? halloweenPromotion : glpPromotion.applies ? glpPromotion : researchSetPromotion;

    let effectiveReferral = customerReferral;
    if (!hasExclusiveJoin25 && !effectiveReferral && referralCodeOwner && referralCodeOwner.id !== contact.id && !priorCustomerOrder) {
      effectiveReferral = await tx.customerReferral.create({
        data: { organizationId, brandId, referrerContactId: referralCodeOwner.id, friendContactId: contact.id },
        select: { id: true, referrerContactId: true, referredOrderId: true },
      });
    }
    const referralCodeMatches = Boolean(
      effectiveReferral && referralCodeOwner && effectiveReferral.referrerContactId === referralCodeOwner.id,
    );
    const maximumReferralDiscount = Math.max(0, grossCentsTotal - Math.ceil(cogsCentsTotal * (1 + marginPercent / 100)));
    const eligibleReferral = !hasExclusiveJoin25 && !promotion.applies && referralCodeMatches && !effectiveReferral?.referredOrderId && !priorCustomerOrder
      && maximumReferralDiscount >= REFERRAL_REWARD_CENTS
      ? effectiveReferral
      : null;

    const affiliate = input.couponCode && !hasExclusiveJoin25 && !promotion.applies && !eligibleReferral
      ? await tx.affiliate.findFirst({
          where: {
            organizationId,
            status: "APPROVED",
            OR: [
              { couponCode: { equals: input.couponCode, mode: "insensitive" } },
              { slug: { equals: input.couponCode, mode: "insensitive" } },
            ],
          },
        })
      : null;
    const eligibleAffiliate = affiliate && affiliate.contactId !== contact.id ? affiliate : null;
    let commissionCents = 0;

    // Real price-discount coupons -- distinct from the Affiliate lookup
    // above, which only computes commission attribution and never
    // touches price. A code that doesn't exist, is expired, or can't be
    // combined with another one just doesn't apply (checkout never fails
    // over a bad promo code) -- evlv-site's checkout should call
    // /api/store/coupons/validate first so the customer sees why.
    let discountCents = promotion.applies && "discountCents" in promotion
      ? promotion.discountCents
      : eligibleReferral
      ? REFERRAL_REWARD_CENTS
      : 0;
    let couponId: string | undefined;
    let appliedCouponCodes: string | undefined = halloweenPromotion.applies
      ? HALLOWEEN_BOGO_PROMOTION_CODE
      : glpPromotion.applies ? GLP_PAIR_PROMOTION_CODE
      : researchSetPromotion.applies
      ? RESEARCH_SET_PROMOTION_CODE
      : eligibleReferral
      ? input.couponCode?.trim().toUpperCase()
      : undefined;
    if (eligibleAffiliate && eligibleAffiliate.customerDiscountPercent > 0) {
      const affiliateDiscount = affiliateDiscountCents(
        grossCentsTotal,
        cogsCentsTotal,
        eligibleAffiliate.customerDiscountPercent,
        org?.minMarginPercent ?? 30,
      );
      discountCents = affiliateDiscount.discountCents;
      appliedCouponCodes = eligibleAffiliate.couponCode;
    }
    // Auto-apply codes (a personal/lifetime deal assigned to this exact
    // contact -- see Coupon.assignedContactId) go first, so a non-stackable
    // personal deal wins over a generic code the customer happens to also
    // type in, and is applied even if they never enter anything at all.
    const requestedCodes = hasExclusiveJoin25
      ? join25Codes
      : promotion.applies || eligibleAffiliate || eligibleReferral
      ? []
      : [...autoApplyCodes, ...(input.discountCodes?.filter(Boolean) ?? [])];
    if (!promotion.applies && !eligibleAffiliate && !eligibleReferral && requestedCodes.length > 0) {
      const maximumDiscountPercent = wholesale?.status === "APPROVED" ? 40 : 30;
      const { coupons } = await resolveCoupons(organizationId, requestedCodes, grossCentsTotal, contact.id);
      if (coupons.length > 0) {
        const evaluation = evaluateCoupons(coupons, couponCartItems, org?.minMarginPercent ?? 30, maximumDiscountPercent);
        discountCents = evaluation.discountCents;
        couponId = evaluation.appliedCoupons[0]?.id;
        appliedCouponCodes = evaluation.appliedCoupons.map((c) => c.code).join(",") || undefined;
        for (const applied of evaluation.appliedCoupons) {
          await tx.coupon.update({ where: { id: applied.id }, data: { redemptionCount: { increment: 1 } } });
        }
      }
    }

    // Everything downstream (netProfitCents, the merchant fee estimate,
    // giveaway thresholds, the order confirmation total) should reflect
    // what the customer is actually charged, i.e. after the coupon --
    // grossCentsTotal is reassigned here rather than threaded through as
    // a second variable so every existing use below picks it up for free.
    grossCentsTotal = Math.max(0, grossCentsTotal - discountCents);

    if (eligibleAffiliate) {
      const effectiveRate = Math.max(0, eligibleAffiliate.ratePercent - eligibleAffiliate.customerDiscountPercent);
      commissionCents = Math.round((grossCentsTotal * effectiveRate) / 100);
    }

    // Calculated after discounts so the free-shipping threshold matches the
    // amount the customer actually owes for products.
    const halloweenLive = halloweenPromotionIsLive(halloweenWindow);
    const freeShippingThresholdCents = halloweenLive
      ? (brand?.halloweenFreeShippingCents ?? FREE_SHIPPING_THRESHOLD_CENTS)
      : FREE_SHIPPING_THRESHOLD_CENTS;
    const shippingCents = grossCentsTotal >= freeShippingThresholdCents ? 0 : FLAT_SHIPPING_CENTS;

    const merchantFeeCents = Math.round((grossCentsTotal * MERCHANT_FEE_PERCENT) / 100) + MERCHANT_FEE_FIXED_CENTS;
    const netProfitCents = grossCentsTotal - cogsCentsTotal - merchantFeeCents - commissionCents;

    const externalOrderNumber = `STORE-${createId()}`;

    const billingName = [input.billing?.firstName, input.billing?.lastName].filter(Boolean).join(" ") || undefined;

    // Simple velocity check, not a scoring model — several ON_HOLD/
    // PROCESSING orders from the same IP in a short window is exactly the
    // "large first order, mismatched details" kind of thing the existing
    // manual flaggedRisk field already exists for (see orders/actions.ts's
    // setFraudFlag). Staff can always clear it; this never blocks checkout.
    let flaggedRisk = false;
    let riskReason: string | undefined;
    if (input.ipAddress) {
      const windowStart = new Date(Date.now() - FRAUD_VELOCITY_WINDOW_HOURS * 60 * 60 * 1000);
      const recentCount = await tx.order.count({
        where: {
          organizationId,
          ipAddress: input.ipAddress,
          placedAt: { gte: windowStart },
          status: { in: ["ON_HOLD", "PROCESSING"] },
        },
      });
      if (recentCount + 1 >= FRAUD_VELOCITY_THRESHOLD) {
        flaggedRisk = true;
        riskReason = `${recentCount + 1} orders from IP ${input.ipAddress} within ${FRAUD_VELOCITY_WINDOW_HOURS}h`;
      }
    }

    const order = await tx.order.create({
      data: {
        organizationId,
        brandId,
        contactId: contact.id,
        externalOrderNumber,
        status: "ON_HOLD",
        couponCode: input.couponCode,
        discountCents,
        couponId,
        appliedCouponCodes,
        grossCents: grossCentsTotal,
        shippingCents,
        netProfitCents,
        paymentMethod: input.paymentMethod,
        paymentMemo: input.paymentMemo,
        placedAt: new Date(),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        flaggedRisk,
        riskReason,
        shipToName: input.shipTo?.name ?? billingName,
        shipToAddress1: input.shipTo?.address1 ?? input.billing?.address1,
        shipToAddress2: input.shipTo?.address2 ?? input.billing?.address2,
        shipToCity: input.shipTo?.city ?? input.billing?.city,
        shipToState: input.shipTo?.state ?? input.billing?.state,
        shipToPostalCode: input.shipTo?.postalCode ?? input.billing?.zip,
        shipToCountry: input.shipTo?.country ?? input.billing?.country,
        items: { createMany: { data: resolvedItems } },
        notes: input.customerNote ? { create: { body: `Customer note: ${input.customerNote}` } } : undefined,
      },
    });

    if (eligibleReferral) {
      await tx.customerReferral.update({ where: { id: eligibleReferral.id }, data: { referredOrderId: order.id } });
    }

    if (eligibleAffiliate && !promotion.applies) {
      await tx.affiliateOrderAttribution.create({
        data: { orderId: order.id, affiliateId: eligibleAffiliate.id, commissionCents },
      });
    }

    return {
      result: {
        id: order.id,
        number: externalOrderNumber,
        orderId: order.id,
        externalOrderNumber,
        grossCents: grossCentsTotal,
        shippingCents,
        total: ((grossCentsTotal + shippingCents) / 100).toFixed(2),
        currency: "USD",
        status: order.status,
      },
      contactEmail: contact.email,
      contactName: contact.name ?? billingName,
      resolvedItems,
      grossCentsTotal,
      shippingCents,
    };
  });

  // Best-effort — a failed email should never fail a checkout that already
  // succeeded. Sent after the transaction commits, not inside it: this is a
  // slow network call and has no business holding the DB transaction open.
  sendOrderEmails(organizationId, {
    brandId,
    orderNumber: result.number,
    customerEmail: contactEmail,
    customerName: contactName || contactEmail,
    items: resolvedItems,
    grossCents: grossCentsTotal,
    shippingCents,
    paymentMethod: input.paymentMethod,
    paymentMemo: input.paymentMemo,
  }).catch((err) => console.error("Order confirmation email failed", err));

  notifySuppliers(organizationId, result.number, resolvedItems).catch((err) => console.error("Supplier notification email failed", err));

  // Not reported to Omnisend here: every storefront order starts ON_HOLD
  // until staff confirm the manual payment, and Omnisend's "placed order"
  // flows (thank-you, post-purchase, replenishment) must not email someone
  // who never paid. omnisend-order-sync.ts reports it once it's paid.

  enterGiveawayIfQualifying(brandId, contactEmail, grossCentsTotal, result.orderId).catch((err) =>
    console.error("Giveaway entry failed", err)
  );

  return result;
}

// Best-effort, same pattern as the email/push notifications above -- a
// giveaway isn't always running (see GiveawayConfig.enabled), and a failure
// here should never fail a checkout that already succeeded.
async function enterGiveawayIfQualifying(brandId: string, email: string, grossCentsTotal: number, orderId: string): Promise<void> {
  const config = await prisma.giveawayConfig.findUnique({ where: { brandId } });
  if (!config || !config.enabled) return;
  if (grossCentsTotal < config.minOrderCents) return;

  await prisma.giveawayEntry.create({
    data: { brandId, email, method: "PURCHASE", orderId, entryDate: utcDateString() },
  });
}

async function notifySuppliers(
  organizationId: string,
  orderNumber: string,
  items: { name: string; quantity: number; supplierId?: string }[]
): Promise<void> {
  const supplierIds = [...new Set(items.map((i) => i.supplierId).filter((id): id is string => Boolean(id)))];
  if (supplierIds.length === 0) return;

  const suppliers = await prisma.supplier.findMany({ where: { id: { in: supplierIds } } });

  for (const supplier of suppliers) {
    if (!supplier.contactEmail) continue;
    const itemsHtml = items
      .filter((i) => i.supplierId === supplier.id)
      .map((i) => `<li>${escapeHtml(i.name)} x${i.quantity}</li>`)
      .join("");
    await sendTemplate(organizationId, "supplier_new_order", supplier.contactEmail, {
      supplierName: supplier.name,
      orderNumber,
      itemsHtml,
    });
  }
}

interface OrderEmailInput {
  brandId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  items: { sku: string; name: string; quantity: number; unitPriceCents: number }[];
  grossCents: number;
  shippingCents: number;
  paymentMethod?: string;
  paymentMemo?: string;
}

async function sendOrderEmails(organizationId: string, input: OrderEmailInput): Promise<void> {
  const itemsHtml = input.items
    .map((i) => `<li>${escapeHtml(i.name)} x${i.quantity} — $${((i.unitPriceCents * i.quantity) / 100).toFixed(2)}</li>`)
    .join("");
  // Customer-facing total = product revenue + shipping. grossCents itself
  // stays product-only (see the doc comment on Order.shippingCents) --
  // this is purely a display sum for emails/push, never written back.
  const totalCents = input.grossCents + input.shippingCents;
  const totalFormatted = `$${(totalCents / 100).toFixed(2)}`;
  const shippingFormatted = input.shippingCents > 0 ? `$${(input.shippingCents / 100).toFixed(2)}` : "Free";
  const vars = {
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    orderNumber: input.orderNumber,
    itemsHtml,
    totalFormatted,
    shippingFormatted,
    paymentMethod: input.paymentMethod ?? "",
    paymentMemo: input.paymentMemo ?? "",
  };

  await sendTemplate(organizationId, "order_confirmation_customer", input.customerEmail, vars, { brandId: input.brandId });

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (organization?.notifyEmail) {
    await sendTemplate(organizationId, "order_confirmation_office", organization.notifyEmail, vars, { brandId: input.brandId });
  }

  // Fulfillment team notification — set FULFILLMENT_EMAIL in .env to enable
  if (process.env.FULFILLMENT_EMAIL) {
    await sendTemplate(organizationId, "order_confirmation_office", process.env.FULFILLMENT_EMAIL, vars, { brandId: input.brandId });
  }

  await pushNotifyNewOrder({
    orderNumber: input.orderNumber,
    customerName: input.customerName || input.customerEmail,
    totalFormatted,
    itemCount: input.items.reduce((sum, i) => sum + i.quantity, 0),
  });
}
