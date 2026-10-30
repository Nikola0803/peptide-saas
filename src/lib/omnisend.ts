// Omnisend push for contacts and orders -- mirrors sendEmail()'s pattern in
// email.ts: gated on OMNISEND_API_KEY, best-effort, never blocks the caller.
export function omnisendConfigured(): boolean {
  return Boolean(process.env.OMNISEND_API_KEY);
}

export async function pushContactToOmnisend(email: string, opts?: { firstName?: string }): Promise<boolean> {
  if (!omnisendConfigured()) {
    console.warn(`[omnisend] Not configured (OMNISEND_API_KEY missing) — skipped pushing ${email}`);
    return false;
  }

  try {
    const res = await fetch("https://api.omnisend.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.OMNISEND_API_KEY!,
      },
      body: JSON.stringify({
        identifiers: [{ type: "email", id: email, channels: { email: { status: "subscribed" } } }],
        firstName: opts?.firstName,
      }),
    });
    if (!res.ok) {
      console.error(`[omnisend] Push failed for ${email}: ${res.status} ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[omnisend] Push errored for ${email}:`, err);
    return false;
  }
}

export interface OmnisendOrderItem {
  productID: string;
  // Omnisend v3 rejects order lines without a variantID (422).
  variantID: string;
  sku: string;
  title: string;
  quantity: number;
  // Omnisend v3 requires integer minor units, not decimal dollars.
  price: number;
}

export interface OmnisendOrderInput {
  orderID: string;
  email: string;
  createdAt: string;
  currency: string;
  orderSum: number;
  subTotalSum: number;
  shippingSum: number;
  discountSum?: number;
  discountCode?: string;
  paymentMethod?: string;
  paymentStatus: "awaitingPayment" | "paid" | "voided" | "partiallyRefunded" | "refunded";
  fulfillmentStatus: "unfulfilled" | "inProgress" | "fulfilled" | "restocked";
  products: OmnisendOrderItem[];
  tags?: string[];
}

export async function pushOrderToOmnisend(input: OmnisendOrderInput): Promise<boolean> {
  if (!omnisendConfigured()) {
    console.warn(`[omnisend] Not configured (OMNISEND_API_KEY missing) — skipped order ${input.orderID}`);
    return false;
  }

  try {
    const res = await fetch("https://api.omnisend.com/v3/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.OMNISEND_API_KEY!,
      },
      body: JSON.stringify({
        orderID: input.orderID,
        email: input.email,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        currency: input.currency,
        orderSum: input.orderSum,
        subTotalSum: input.subTotalSum,
        shippingSum: input.shippingSum,
        discountSum: input.discountSum,
        discountCode: input.discountCode,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        fulfillmentStatus: input.fulfillmentStatus,
        products: input.products,
        tags: input.tags,
      }),
    });
    if (!res.ok) {
      console.error(`[omnisend] Order push failed for ${input.orderID}: ${res.status} ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[omnisend] Order push errored for ${input.orderID}:`, err);
    return false;
  }
}
