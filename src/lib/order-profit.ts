// One place for "Net profit (products)" so checkout, the recalculation
// script and the dashboard earnings summary all agree.
//
//   products paid = grossCents, minus the storefront's 5% P2P discount when
//                   the customer paid by Cash App / Zelle / Venmo / other P2P
//   card fee      = 2.9% + $0.30 of products paid, card (Niftipay) only;
//                   P2P transfers carry no processor fee
//   net profit    = products paid - COGS - card fee - affiliate commission
//
// The P2P discount is taken off the products amount only. Shipping is not
// part of product profit.

export const MERCHANT_FEE_PERCENT = 2.9;
export const MERCHANT_FEE_FIXED_CENTS = 30;
export const P2P_DISCOUNT_PERCENT = 5;

// Gateways that are card payments through a processor. Everything else the
// storefront sends (cashapp, zelle, venmo, ...) is a P2P transfer. Orders
// with no payment method (older WooCommerce orders) are treated as card so
// their fee estimate does not change.
const CARD_METHODS = new Set(["niftipay", "card", "credit_card", "stripe"]);

export function isP2PPayment(paymentMethod: string | null | undefined): boolean {
  const method = paymentMethod?.trim().toLowerCase();
  if (!method) return false;
  return !CARD_METHODS.has(method);
}

export type ProductProfitBreakdown = {
  productsPaidCents: number;
  p2pDiscountCents: number;
  cogsCents: number;
  feeCents: number;
  commissionCents: number;
  netProfitCents: number;
};

export function computeProductProfit(input: {
  grossCents: number;
  paymentMethod: string | null | undefined;
  cogsCents: number;
  commissionCents: number;
}): ProductProfitBreakdown {
  const p2p = isP2PPayment(input.paymentMethod);
  const p2pDiscountCents = p2p ? Math.round((input.grossCents * P2P_DISCOUNT_PERCENT) / 100) : 0;
  const productsPaidCents = Math.max(0, input.grossCents - p2pDiscountCents);
  const feeCents = p2p || productsPaidCents === 0
    ? 0
    : Math.round((productsPaidCents * MERCHANT_FEE_PERCENT) / 100) + MERCHANT_FEE_FIXED_CENTS;
  return {
    productsPaidCents,
    p2pDiscountCents,
    cogsCents: input.cogsCents,
    feeCents,
    commissionCents: input.commissionCents,
    netProfitCents: productsPaidCents - input.cogsCents - feeCents - input.commissionCents,
  };
}
