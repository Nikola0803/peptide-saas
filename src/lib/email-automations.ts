import { prisma } from "@/lib/prisma";
import type { EmailAutomation, DelayUnit } from "@prisma/client";

export interface AutomationDefault {
  key: string;
  name: string;
  description: string;
  templateKey: string;
  defaultDelayValue: number;
  defaultDelayUnit: DelayUnit;
  defaultThresholdCents?: number;
  /** Purely informational -- shown in the UI, not enforced in code, so an
   * operator understands what has to be true before flipping this on. */
  requires?: string;
}

// The 15-flow lifecycle plan, minus welcome (#1) and order confirmation
// (#6), which already fire immediately at signup/checkout in
// order-engine.ts / auth/register -- not delay-based, so they don't belong
// in the automation table. referral_earned/credit_reminder (needs a
// customer store-credit system that doesn't exist yet) and re_engagement
// (needs Resend open/click webhooks, also not built) are deliberately
// left out of this list rather than faked -- see the Email page's "Not
// available yet" section for those three.
export const DEFAULT_AUTOMATIONS: AutomationDefault[] = [
  {
    key: "welcome_2",
    name: "Welcome #2",
    description: "Why EVLV, testing/quality/COAs, product categories -- a few days after signup.",
    templateKey: "welcome_2",
    defaultDelayValue: 3,
    defaultDelayUnit: "DAYS",
  },
  {
    key: "browse_abandonment",
    name: "Browse abandonment",
    description: '"Still researching?" -- viewed a product, didn\'t add to cart or buy.',
    templateKey: "browse_abandonment",
    defaultDelayValue: 2,
    defaultDelayUnit: "HOURS",
    requires: "Needs the contact's email linked to their browsing (happens automatically once they've entered their email at checkout or logged in).",
  },
  {
    key: "cart_abandonment",
    name: "Cart abandonment",
    description: "Added to cart, didn't check out. Includes what was in the cart.",
    templateKey: "cart_abandonment",
    defaultDelayValue: 3,
    defaultDelayUnit: "HOURS",
    requires: "Same email-linking requirement as browse abandonment.",
  },
  {
    key: "checkout_abandonment",
    name: "Checkout abandonment",
    description: "Started checkout, didn't finish -- stronger conversion push.",
    templateKey: "checkout_abandonment",
    defaultDelayValue: 1,
    defaultDelayUnit: "HOURS",
    requires: "Same email-linking requirement as browse abandonment.",
  },
  {
    key: "payment_pending_reminder",
    name: "Payment pending reminder",
    description: "Order placed, payment not confirmed yet -- nudge before the 24h stock-release window closes.",
    templateKey: "payment_pending_reminder",
    defaultDelayValue: 12,
    defaultDelayUnit: "HOURS",
  },
  {
    key: "payment_confirmed",
    name: "Payment confirmed",
    description: '"Your EVLV order is confirmed" -- fires the moment staff confirms payment.',
    templateKey: "payment_confirmed",
    defaultDelayValue: 0,
    defaultDelayUnit: "MINUTES",
  },
  {
    key: "shipping_confirmation",
    name: "Shipping confirmation",
    description: "Tracking number available.",
    templateKey: "shipping_confirmation",
    defaultDelayValue: 0,
    defaultDelayUnit: "MINUTES",
  },
  {
    key: "post_purchase",
    name: "Post-purchase",
    description: "COA/documentation reminder, account nudge -- a few days after an order completes.",
    templateKey: "post_purchase",
    defaultDelayValue: 5,
    defaultDelayUnit: "DAYS",
  },
  {
    key: "win_back",
    name: "Win-back",
    description: "No order in a while -- behavior-based re-activation.",
    templateKey: "win_back",
    defaultDelayValue: 45,
    defaultDelayUnit: "DAYS",
  },
  {
    key: "vip",
    name: "VIP",
    description: "Trailing-90-day spend crosses a threshold -- high-value/repeat customers.",
    templateKey: "vip_thank_you",
    defaultDelayValue: 0,
    defaultDelayUnit: "DAYS",
    defaultThresholdCents: 50000,
  },
];

// Lazily upserts any DEFAULT_AUTOMATIONS row this org doesn't have yet
// (all start disabled), then returns every row -- same pattern as
// email.ts's getTemplate() falling back to DEFAULT_TEMPLATES, but these
// need to actually exist as rows since enabled/delay are mutable per-org
// state, not just a content override.
export async function getAutomations(organizationId: string): Promise<EmailAutomation[]> {
  const existing = await prisma.emailAutomation.findMany({ where: { organizationId } });
  const existingKeys = new Set(existing.map((a) => a.key));
  const missing = DEFAULT_AUTOMATIONS.filter((d) => !existingKeys.has(d.key));

  if (missing.length > 0) {
    await prisma.emailAutomation.createMany({
      data: missing.map((d) => ({
        organizationId,
        key: d.key,
        name: d.name,
        templateKey: d.templateKey,
        delayValue: d.defaultDelayValue,
        delayUnit: d.defaultDelayUnit,
        thresholdCents: d.defaultThresholdCents ?? null,
        enabled: false,
      })),
    });
    return prisma.emailAutomation.findMany({ where: { organizationId }, orderBy: { key: "asc" } });
  }

  return existing.sort((a, b) => a.key.localeCompare(b.key));
}

export function delayToMs(value: number, unit: DelayUnit): number {
  const unitMs = unit === "MINUTES" ? 60_000 : unit === "HOURS" ? 60 * 60_000 : 24 * 60 * 60_000;
  return value * unitMs;
}
