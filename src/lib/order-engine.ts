import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";

// Flat-rate assumption for a card processor fee — matches the WooCommerce
// webhook ingestion path in src/app/api/webhooks/woocommerce/route.ts. Not
// actually charged here (storefront checkout is pay-by-memo, see below),
// kept only so netProfitCents stays comparable across both order sources.
const MERCHANT_FEE_PERCENT = 2.9;
const MERCHANT_FEE_FIXED_CENTS = 30;

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
  customerName?: string;
  couponCode?: string;
  // Which rail (cashapp/zelle/venmo/...) plus the reference the customer
  // says they'll pay with — there's no real-time card capture on this
  // path, so the order lands as ON_HOLD until staff reconciles the memo
  // against the payment rail.
  paymentMethod?: string;
  paymentMemo?: string;
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
}

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly code: "EMPTY_CART" | "UNKNOWN_PRODUCT" | "OUT_OF_STOCK",
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

  return prisma.$transaction(async (tx) => {
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

    let grossCentsTotal = 0;
    let cogsCentsTotal = 0;
    const resolvedItems: {
      productId: string;
      sku: string;
      name: string;
      quantity: number;
      unitPriceCents: number;
      lotId?: string;
    }[] = [];

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
      if (product.masterStock < quantity) {
        throw new CheckoutError(`Insufficient stock for ${product.sku}`, "OUT_OF_STOCK", {
          slug: item.slug,
          available: product.masterStock,
        });
      }

      const unitPriceCents = mapping.storePriceCents;
      grossCentsTotal += unitPriceCents * quantity;
      cogsCentsTotal += product.cogsCents * quantity;

      await tx.product.update({ where: { id: product.id }, data: { masterStock: { decrement: quantity } } });

      // FIFO batch allocation, same as the WooCommerce ingestion path — see
      // that file's comment for why this is what makes a recall list
      // possible later.
      let lotId: string | undefined;
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

      resolvedItems.push({ productId: product.id, sku: product.sku, name: product.chemicalName, quantity, unitPriceCents, lotId });
    }

    let commissionCents = 0;
    if (input.couponCode) {
      const affiliate = await tx.affiliate.findFirst({
        where: { organizationId, couponCode: { equals: input.couponCode, mode: "insensitive" } },
      });
      if (affiliate) {
        commissionCents = Math.round((grossCentsTotal * affiliate.ratePercent) / 100);
      }
    }

    const merchantFeeCents = Math.round((grossCentsTotal * MERCHANT_FEE_PERCENT) / 100) + MERCHANT_FEE_FIXED_CENTS;
    const netProfitCents = grossCentsTotal - cogsCentsTotal - merchantFeeCents - commissionCents;

    const externalOrderNumber = `STORE-${createId()}`;

    const billingName = [input.billing?.firstName, input.billing?.lastName].filter(Boolean).join(" ") || undefined;

    const order = await tx.order.create({
      data: {
        organizationId,
        brandId,
        contactId: contact.id,
        externalOrderNumber,
        status: "ON_HOLD",
        couponCode: input.couponCode,
        grossCents: grossCentsTotal,
        netProfitCents,
        paymentMethod: input.paymentMethod,
        paymentMemo: input.paymentMemo,
        placedAt: new Date(),
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

    if (input.couponCode && commissionCents > 0) {
      const affiliate = await tx.affiliate.findFirst({
        where: { organizationId, couponCode: { equals: input.couponCode, mode: "insensitive" } },
      });
      if (affiliate) {
        await tx.affiliateOrderAttribution.create({
          data: { orderId: order.id, affiliateId: affiliate.id, commissionCents },
        });
      }
    }

    return {
      id: order.id,
      number: externalOrderNumber,
      orderId: order.id,
      externalOrderNumber,
      grossCents: grossCentsTotal,
      status: order.status,
    };
  });
}
