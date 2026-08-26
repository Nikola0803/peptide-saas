import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyCustomerToken } from "@/lib/customer-auth";
import { runCheckout, CheckoutError } from "@/lib/order-engine";

const bodySchema = z.object({
  items: z.array(z.object({ slug: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  // Sent by evlv-site when the customer is signed in — not currently used
  // to resolve the contact (the token already does that), accepted so the
  // request doesn't need to be stripped down before it reaches here.
  customerId: z.string().optional(),
  couponCode: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentMemo: z.string().optional(),
  customerNote: z.string().optional(),
  // evlv-site's real checkout payload shape — see CheckoutBillingInput.
  billing: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  shipTo: z
    .object({
      name: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

// POST /api/store/checkout — matches CheckoutInput in src/lib/order-engine.ts.
// Works for both a logged-in customer (send the bearer token from
// /api/store/auth/login — customerEmail is then optional, taken from the
// token) and a guest checkout (customerEmail required in the body).
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const claims = verifyCustomerToken(bearerToken(req));
  const customerEmail = claims?.email ?? parsed.data.customerEmail ?? parsed.data.billing?.email;
  if (!customerEmail) {
    return NextResponse.json({ error: "customerEmail is required for guest checkout" }, { status: 400 });
  }

  try {
    const result = await runCheckout(store.organizationId, store.brandId, {
      items: parsed.data.items,
      customerEmail,
      customerName: parsed.data.customerName,
      couponCode: parsed.data.couponCode,
      paymentMethod: parsed.data.paymentMethod,
      paymentMemo: parsed.data.paymentMemo,
      customerNote: parsed.data.customerNote,
      billing: parsed.data.billing,
      shipTo: parsed.data.shipTo,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json({ error: err.message, code: err.code, detail: err.detail }, { status: 422 });
    }
    console.error("Checkout failed", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
