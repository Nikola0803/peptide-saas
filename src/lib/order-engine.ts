import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { sendTemplate, escapeHtml } from "@/lib/email";

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

  const { result, contactEmail, contactName, resolvedItems, grossCentsTotal } = await prisma.$transaction(async (tx) => {
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
      supplierId?: string;
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

      // Dropshipping — if a supplier currently lists this product as
      // in-stock, this item is theirs to fulfill; sticks with the item
      // permanently even if the SupplierProduct row changes later (see
      // OrderItem.supplierId's doc comment in schema.prisma).
      const supplierProduct = await tx.supplierProduct.findFirst({
        where: { productId: product.id, active: true, supplier: { active: true } },
      });

      resolvedItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.chemicalName,
        quantity,
        unitPriceCents,
        lotId,
        supplierId: supplierProduct?.supplierId,
      });
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
        grossCents: grossCentsTotal,
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
      result: {
        id: order.id,
        number: externalOrderNumber,
        orderId: order.id,
        externalOrderNumber,
        grossCents: grossCentsTotal,
        status: order.status,
      },
      contactEmail: contact.email,
      contactName: contact.name ?? billingName,
      resolvedItems,
      grossCentsTotal,
    };
  });

  // Best-effort — a failed email should never fail a checkout that already
  // succeeded. Sent after the transaction commits, not inside it: this is a
  // slow network call and has no business holding the DB transaction open.
  sendOrderEmails(organizationId, {
    orderNumber: result.number,
    customerEmail: contactEmail,
    customerName: contactName || contactEmail,
    items: resolvedItems,
    grossCents: grossCentsTotal,
    paymentMethod: input.paymentMethod,
    paymentMemo: input.paymentMemo,
  }).catch((err) => console.error("Order confirmation email failed", err));

  notifySuppliers(organizationId, result.number, resolvedItems).catch((err) => console.error("Supplier notification email failed", err));

  return result;
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
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  items: { name: string; quantity: number; unitPriceCents: number }[];
  grossCents: number;
  paymentMethod?: string;
  paymentMemo?: string;
}

async function sendOrderEmails(organizationId: string, input: OrderEmailInput): Promise<void> {
  const itemsHtml = input.items
    .map((i) => `<li>${escapeHtml(i.name)} x${i.quantity} — $${((i.unitPriceCents * i.quantity) / 100).toFixed(2)}</li>`)
    .join("");
  const totalFormatted = `$${(input.grossCents / 100).toFixed(2)}`;
  const vars = {
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    orderNumber: input.orderNumber,
    itemsHtml,
    totalFormatted,
    paymentMethod: input.paymentMethod ?? "",
    paymentMemo: input.paymentMemo ?? "",
  };

  await sendTemplate(organizationId, "order_confirmation_customer", input.customerEmail, vars);

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (organization?.notifyEmail) {
    await sendTemplate(organizationId, "order_confirmation_office", organization.notifyEmail, vars);
  }
}
