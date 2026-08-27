import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/email";
import { getAutomations, delayToMs } from "@/lib/email-automations";
import type { EmailAutomation } from "@prisma/client";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // matches stock-release-job.ts's cadence
let started = false;

async function alreadySent(automationId: string, dedupKey: string): Promise<boolean> {
  const existing = await prisma.emailAutomationSend.findUnique({
    where: { automationId_dedupKey: { automationId, dedupKey } },
  });
  return Boolean(existing);
}

async function recordSend(automationId: string, dedupKey: string, contactId?: string) {
  await prisma.emailAutomationSend.create({ data: { automationId, dedupKey, contactId } }).catch(() => {
    // Unique violation = a concurrent tick already sent this -- fine, we
    // just wanted to guarantee at-most-once, not surface a race as an error.
  });
}

function automationByKey(automations: EmailAutomation[], key: string): EmailAutomation | undefined {
  return automations.find((a) => a.key === key);
}

// --- welcome_2: N days after a contact created an account ---------------
async function runWelcome2(organizationId: string, automation: EmailAutomation) {
  const cutoff = new Date(Date.now() - delayToMs(automation.delayValue, automation.delayUnit));
  const contacts = await prisma.contact.findMany({
    where: { organizationId, passwordHash: { not: null }, createdAt: { lte: cutoff } },
    take: 200,
  });
  for (const contact of contacts) {
    if (await alreadySent(automation.id, contact.id)) continue;
    await sendTemplate(organizationId, automation.templateKey, contact.email, { customerName: contact.name || contact.email });
    await recordSend(automation.id, contact.id, contact.id);
  }
}

// --- browse/cart/checkout abandonment ------------------------------------
// All three share the same shape: a TrackingEvent fired, delayValue later
// the contact still hasn't placed an order, so remind them. Correlation
// from anonymous visitorId to a known Contact only works once
// Contact.lastVisitorId has been set (see /api/t's "identify" handling) --
// a contact who never entered their email while browsing simply never
// matches, which is a silent no-op, not an error.
async function runAbandonment(
  organizationId: string,
  automation: EmailAutomation,
  eventName: "view_content" | "add_to_cart" | "begin_checkout",
  buildVars: (contact: { name: string | null; email: string }, events: { properties: unknown }[]) => Record<string, string>
) {
  const delayMs = delayToMs(automation.delayValue, automation.delayUnit);
  const eventCutoff = new Date(Date.now() - delayMs);
  // Don't reach back further than 3x the delay -- an event from a week ago
  // is stale, not "abandoned 20 minutes from now."
  const windowStart = new Date(Date.now() - delayMs * 3);

  const contacts = await prisma.contact.findMany({
    where: { organizationId, lastVisitorId: { not: null }, lastVisitorSeenAt: { gte: windowStart } },
    take: 200,
  });

  for (const contact of contacts) {
    if (await alreadySent(automation.id, contact.id)) continue;

    const events = await prisma.trackingEvent.findMany({
      where: {
        organizationId,
        visitorId: contact.lastVisitorId!,
        eventName,
        createdAt: { gte: windowStart, lte: eventCutoff },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (events.length === 0) continue;

    // Skip if they've ordered since the event that would trigger this --
    // they already converted, nothing to remind them about.
    const orderedSince = await prisma.order.findFirst({
      where: { contactId: contact.id, placedAt: { gte: events[events.length - 1].createdAt } },
    });
    if (orderedSince) continue;

    await sendTemplate(organizationId, automation.templateKey, contact.email, buildVars({ name: contact.name, email: contact.email }, events));
    await recordSend(automation.id, contact.id, contact.id);
  }
}

// --- payment_pending_reminder: order still ON_HOLD, unpaid ---------------
async function runPaymentPendingReminder(organizationId: string, automation: EmailAutomation) {
  const cutoff = new Date(Date.now() - delayToMs(automation.delayValue, automation.delayUnit));
  const orders = await prisma.order.findMany({
    where: { organizationId, status: "ON_HOLD", stockReleasedAt: null, placedAt: { lte: cutoff } },
    include: { contact: true },
    take: 200,
  });
  for (const order of orders) {
    if (!order.contact) continue;
    if (await alreadySent(automation.id, order.id)) continue;
    await sendTemplate(organizationId, automation.templateKey, order.contact.email, {
      customerName: order.contact.name || order.contact.email,
      orderNumber: order.externalOrderNumber,
      paymentMethod: order.paymentMethod ?? "",
      paymentMemo: order.paymentMemo ?? "",
    });
    await recordSend(automation.id, order.id, order.contactId ?? undefined);
  }
}

// --- shipping_confirmation: shippedAt set, not yet emailed ---------------
async function runShippingConfirmation(organizationId: string, automation: EmailAutomation) {
  const cutoff = new Date(Date.now() - delayToMs(automation.delayValue, automation.delayUnit));
  const orders = await prisma.order.findMany({
    where: { organizationId, shippedAt: { not: null, lte: cutoff } },
    include: { contact: true },
    take: 200,
  });
  for (const order of orders) {
    if (!order.contact) continue;
    if (await alreadySent(automation.id, order.id)) continue;
    await sendTemplate(organizationId, automation.templateKey, order.contact.email, {
      customerName: order.contact.name || order.contact.email,
      orderNumber: order.externalOrderNumber,
      trackingNumber: order.trackingNumber ?? "",
      carrierCode: order.carrierCode ?? "",
    });
    await recordSend(automation.id, order.id, order.contactId ?? undefined);
  }
}

// --- post_purchase: N days after an order completed ----------------------
async function runPostPurchase(organizationId: string, automation: EmailAutomation) {
  const cutoff = new Date(Date.now() - delayToMs(automation.delayValue, automation.delayUnit));
  const orders = await prisma.order.findMany({
    where: { organizationId, status: "COMPLETED" },
    include: { contact: true },
    take: 200,
  });
  for (const order of orders) {
    if (!order.contact) continue;
    // paymentConfirmedAt may be null if staff jumped straight to Completed
    // without going through Confirm Payment -- fall back to placedAt so
    // this flow still fires eventually instead of silently never matching.
    const referenceAt = order.paymentConfirmedAt ?? order.placedAt;
    if (referenceAt > cutoff) continue;
    if (await alreadySent(automation.id, order.id)) continue;
    await sendTemplate(organizationId, automation.templateKey, order.contact.email, {
      customerName: order.contact.name || order.contact.email,
      orderNumber: order.externalOrderNumber,
    });
    await recordSend(automation.id, order.id, order.contactId ?? undefined);
  }
}

// --- win_back: no order in delayValue days --------------------------------
async function runWinBack(organizationId: string, automation: EmailAutomation) {
  const cutoff = new Date(Date.now() - delayToMs(automation.delayValue, automation.delayUnit));
  const contacts = await prisma.contact.findMany({
    where: { organizationId, orders: { some: {} } },
    include: { orders: { orderBy: { placedAt: "desc" }, take: 1 } },
    take: 500,
  });
  for (const contact of contacts) {
    const lastOrder = contact.orders[0];
    if (!lastOrder || lastOrder.placedAt > cutoff) continue;
    // Re-fires once per cutoff period rolled up by month, so a permanently
    // inactive contact doesn't get this every single job tick forever --
    // dedup key includes the month so it can legitimately re-send later.
    const cycleKey = `${contact.id}:${new Date().getFullYear()}-${new Date().getMonth()}`;
    if (await alreadySent(automation.id, cycleKey)) continue;
    await sendTemplate(organizationId, automation.templateKey, contact.email, { customerName: contact.name || contact.email });
    await recordSend(automation.id, cycleKey, contact.id);
  }
}

// --- vip: trailing 90-day spend crosses thresholdCents --------------------
async function runVip(organizationId: string, automation: EmailAutomation) {
  if (!automation.thresholdCents) return;
  const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const spend = await prisma.order.groupBy({
    by: ["contactId"],
    where: { organizationId, placedAt: { gte: windowStart }, status: { in: ["COMPLETED", "PROCESSING"] }, contactId: { not: null } },
    _sum: { grossCents: true },
  });
  for (const row of spend) {
    if (!row.contactId || (row._sum.grossCents ?? 0) < automation.thresholdCents) continue;
    // Re-qualifies once per quarter, same reasoning as win_back's monthly cycle.
    const quarter = Math.floor(new Date().getMonth() / 3);
    const cycleKey = `${row.contactId}:${new Date().getFullYear()}-Q${quarter}`;
    if (await alreadySent(automation.id, cycleKey)) continue;
    const contact = await prisma.contact.findUnique({ where: { id: row.contactId } });
    if (!contact) continue;
    await sendTemplate(organizationId, automation.templateKey, contact.email, { customerName: contact.name || contact.email });
    await recordSend(automation.id, cycleKey, contact.id);
  }
}

async function runForOrganization(organizationId: string) {
  const automations = await getAutomations(organizationId);
  const enabled = automations.filter((a) => a.enabled);
  if (enabled.length === 0) return;

  const run = async (key: string, fn: (organizationId: string, automation: EmailAutomation) => Promise<void>) => {
    const automation = automationByKey(enabled, key);
    if (!automation) return;
    await fn(organizationId, automation).catch((err) => console.error(`[automation-job] ${key} failed for org ${organizationId}`, err));
  };

  await run("welcome_2", runWelcome2);
  await run("browse_abandonment", (orgId, a) =>
    runAbandonment(orgId, a, "view_content", (contact, events) => {
      const props = (events[0]?.properties as { name?: string; slug?: string } | null) ?? null;
      return {
        customerName: contact.name || contact.email,
        productName: props?.name ?? "that product",
        productUrl: props?.slug ? `/shop/${props.slug}` : "/shop",
      };
    })
  );
  await run("cart_abandonment", (orgId, a) =>
    runAbandonment(orgId, a, "add_to_cart", (contact, events) => {
      const itemsHtml = events
        .map((e) => {
          const props = e.properties as { name?: string } | null;
          return `<li>${props?.name ?? "Item"}</li>`;
        })
        .join("");
      return { customerName: contact.name || contact.email, itemsHtml, checkoutUrl: "/checkout" };
    })
  );
  await run("checkout_abandonment", (orgId, a) =>
    runAbandonment(orgId, a, "begin_checkout", (contact) => ({
      customerName: contact.name || contact.email,
      checkoutUrl: "/checkout",
    }))
  );
  await run("payment_pending_reminder", runPaymentPendingReminder);
  await run("shipping_confirmation", runShippingConfirmation);
  await run("post_purchase", runPostPurchase);
  await run("win_back", runWinBack);
  await run("vip", runVip);
}

export async function runAllAutomations() {
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  for (const org of organizations) {
    await runForOrganization(org.id).catch((err) => console.error(`[automation-job] failed for org ${org.id}`, err));
  }
}

export function startAutomationJob() {
  if (started) return;
  started = true;
  runAllAutomations().catch((err) => console.error("[automation-job] initial run failed", err));
  setInterval(() => {
    runAllAutomations().catch((err) => console.error("[automation-job] tick failed", err));
  }, CHECK_INTERVAL_MS);
}

// Referenced by orders/actions.ts's confirmPayment -- delay=0 flows fire
// immediately from the action itself rather than waiting for the next poll
// tick, since "the moment we confirm payment" is a real event, not
// something worth a 15-minute delay for.
export async function sendPaymentConfirmedEmail(organizationId: string, orderId: string) {
  const automations = await getAutomations(organizationId);
  const automation = automationByKey(automations, "payment_confirmed");
  if (!automation?.enabled) return;

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { contact: true } });
  if (!order?.contact) return;
  if (await alreadySent(automation.id, order.id)) return;

  await sendTemplate(organizationId, automation.templateKey, order.contact.email, {
    customerName: order.contact.name || order.contact.email,
    orderNumber: order.externalOrderNumber,
  });
  await recordSend(automation.id, order.id, order.contactId ?? undefined);
}
