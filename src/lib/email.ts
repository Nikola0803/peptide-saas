import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, html: string, options?: { replyTo?: string }): Promise<boolean> {
  if (!resend || !process.env.EMAIL_FROM) {
    console.warn(`[email] Not configured (RESEND_API_KEY/EMAIL_FROM missing) — skipped "${subject}" to ${to}`);
    return false;
  }
  const payload: { from: string; to: string; subject: string; html: string; replyTo?: string } = {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  };
  if (options?.replyTo) payload.replyTo = options.replyTo;
  const { error } = await resend.emails.send(payload);
  if (error) {
    console.error(`[email] Send failed for "${subject}" to ${to}:`, error);
    return false;
  }
  return true;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => vars[key] ?? "")
    .replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] ?? ""));
}

export function unsubscribeFooterHtml(unsubscribeUrl: string): string {
  return `<p style="margin-top: 24px; font-size: 12px; color: #999;">Don't want these emails? <a href="${unsubscribeUrl}" style="color: #999;">Unsubscribe</a>.</p>`;
}

export interface EmailTemplateDefault {
  key: string;
  name: string;
  subject: string;
  html: string;
  description: string;
  sampleVars: Record<string, string>;
}

const LAYOUT = (body: string) => `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1c1c1c;">
  ${body}
  <p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #888;">
    EVLV Peptides · For research use only.
  </p>
</div>`;

export const DEFAULT_TEMPLATES: EmailTemplateDefault[] = [
  {
    key: "welcome_customer",
    name: "Welcome (new account)",
    description: "Sent right after someone creates an account on evlv-site.",
    subject: "Welcome to EVLV, {{customerName}}",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Welcome to EVLV, {{customerName}}</h1>
      <p>Your account is set up. You can track orders, view COAs, and manage your addresses any time from your account page.</p>
      <p>Questions before your first order? Just reply to this email.</p>
    `),
  },
  {
    key: "order_confirmation_customer",
    name: "Order confirmation (customer)",
    description: "Sent to the customer right after checkout.",
    subject: "Your EVLV order {{orderNumber}} is confirmed",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123", itemsHtml: "<li>BPC-157 10MG x1 — $70.00</li>", shippingFormatted: "$15.00", totalFormatted: "$85.00", paymentMethod: "zelle", paymentMemo: "EVLV-JORDAN" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks for your order, {{customerName}}!</h1>
      <p>We've received order <strong>{{orderNumber}}</strong> and it's on hold pending payment confirmation.</p>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
      <p>Shipping: {{shippingFormatted}}</p>
      <p><strong>Total: {{totalFormatted}}</strong></p>
      <p>Payment method: {{paymentMethod}}<br/>Memo/reference: {{paymentMemo}}</p>
      <p>Once we confirm your payment, we'll get your order shipped out. Reply to this email if you have any questions.</p>
    `),
  },
  {
    key: "order_confirmation_office",
    name: "New order notification (office)",
    description: "Sent internally to the office/ops inbox whenever an order comes in.",
    subject: "New order {{orderNumber}} — {{totalFormatted}}",
    sampleVars: { customerName: "Jordan", customerEmail: "jordan@lab.edu", orderNumber: "STORE-ABC123", itemsHtml: "<li>BPC-157 10MG x1 — $70.00</li>", shippingFormatted: "$15.00", totalFormatted: "$85.00", paymentMethod: "zelle", paymentMemo: "EVLV-JORDAN" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">New order: {{orderNumber}}</h1>
      <p>{{customerName}} ({{customerEmail}})</p>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
      <p>Shipping: {{shippingFormatted}}</p>
      <p><strong>Total: {{totalFormatted}}</strong></p>
      <p>Payment method: {{paymentMethod}}<br/>Memo/reference to reconcile: {{paymentMemo}}</p>
    `),
  },
  {
    key: "contact_form_received",
    name: "New contact form message (office)",
    description: "Sent internally whenever a visitor submits the storefront contact form.",
    subject: "New contact form message{{subjectSuffix}}",
    sampleVars: { contactName: "Jordan", contactEmail: "jordan@lab.edu", subjectLine: "Order Question", messageHtml: "Where's my order?", subjectSuffix: ": Order Question", conversationUrl: "https://crm.evlvpeptides.com/support/abc123" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">New contact form message</h1>
      <p>{{contactName}} ({{contactEmail}})</p>
      <p>Subject: {{subjectLine}}</p>
      <p style="white-space: pre-line;">{{{messageHtml}}}</p>
      <p style="margin-top: 20px;"><a href="{{conversationUrl}}" style="display: inline-block; background: #1c1c1c; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 500;">View in Support →</a></p>
    `),
  },
  {
    key: "supplier_new_order",
    name: "New order notification (supplier)",
    description: "Sent to a dropship supplier when one of their products is ordered.",
    subject: "New order to fulfill: {{orderNumber}}",
    sampleVars: { supplierName: "Acme Fulfillment", orderNumber: "STORE-ABC123", itemsHtml: "<li>BPC-157 10MG x1</li>" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">New order to fulfill</h1>
      <p>Hi {{supplierName}}, order <strong>{{orderNumber}}</strong> includes your product(s):</p>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
      <p>Log in to your dropship portal to see the shipping address and mark it shipped once it's out.</p>
    `),
  },
  {
    key: "supplier_invoice_generated",
    name: "Supplier invoice generated (office)",
    description: "Sent to the office/ops inbox when a dropship supplier generates an invoice.",
    subject: "New invoice from {{supplierName}}: {{totalFormatted}}",
    sampleVars: { supplierName: "Acme Fulfillment", totalFormatted: "$420.00", itemCount: "12" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">New supplier invoice</h1>
      <p><strong>{{supplierName}}</strong> generated an invoice for {{itemCount}} shipped item(s), totaling <strong>{{totalFormatted}}</strong>.</p>
      <p>Review and mark it sent/paid from the Suppliers page.</p>
    `),
  },
  {
    key: "supplier_coa_uploaded",
    name: "Supplier COA uploaded (office)",
    description: "Sent when a dropship supplier uploads a COA for one of their products.",
    subject: "COA uploaded for review: {{productName}}",
    sampleVars: { supplierName: "Acme Fulfillment", productName: "BPC-157 10MG" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">New COA to review</h1>
      <p><strong>{{supplierName}}</strong> uploaded a COA for <strong>{{productName}}</strong>. It won't show on the storefront until you publish it from the product page.</p>
    `),
  },
  {
    key: "supplier_invoice_paid",
    name: "Supplier invoice paid",
    description: "Sent to a dropship supplier when staff marks one of their invoices as paid.",
    subject: "Payment sent: your EVLV invoice",
    sampleVars: { supplierName: "Acme Fulfillment", totalFormatted: "$420.00" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Payment sent</h1>
      <p>Hi {{supplierName}}, we've marked your invoice for <strong>{{totalFormatted}}</strong> as paid.</p>
    `),
  },
  {
    key: "affiliate_approved",
    name: "Affiliate application approved",
    description: "Sent when a self-serve affiliate application is approved.",
    subject: "You're approved as an EVLV affiliate!",
    sampleVars: { affiliateName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Welcome to the EVLV affiliate program, {{affiliateName}}!</h1>
      <p>Your application has been approved. Log in to your affiliate dashboard to grab your referral link, track clicks and commission, and set up how you'd like to get paid.</p>
    `),
  },
  {
    key: "affiliate_rejected",
    name: "Affiliate application rejected",
    description: "Sent when a self-serve affiliate application is rejected.",
    subject: "Update on your EVLV affiliate application",
    sampleVars: { affiliateName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your affiliate application</h1>
      <p>Hi {{affiliateName}}, thanks for your interest in the EVLV affiliate program. We're not able to approve your application at this time.</p>
      <p>If you think this was a mistake or your situation has changed, feel free to reply to this email.</p>
    `),
  },
  {
    key: "wholesale_approved",
    name: "Wholesale inquiry approved",
    description: "Sent when a wholesale inquiry is approved.",
    subject: "You're approved as an EVLV wholesale partner",
    sampleVars: { contactName: "Jordan", companyName: "Acme Labs" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Welcome as an EVLV wholesale partner, {{contactName}}!</h1>
      <p>{{companyName}}'s wholesale inquiry has been approved. We'll be in touch with next steps.</p>
    `),
  },
  {
    key: "wholesale_rejected",
    name: "Wholesale inquiry rejected",
    description: "Sent when a wholesale inquiry is rejected.",
    subject: "Update on your EVLV wholesale inquiry",
    sampleVars: { contactName: "Jordan", companyName: "Acme Labs" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your wholesale inquiry</h1>
      <p>Hi {{contactName}}, thanks for {{companyName}}'s interest in an EVLV wholesale partnership. We're not able to move forward at this time.</p>
    `),
  },
  {
    key: "affiliate_payout_paid",
    name: "Affiliate payout sent",
    description: "Sent when staff marks an affiliate payout request as paid.",
    subject: "Your EVLV affiliate payout is on its way",
    sampleVars: { affiliateName: "Jordan", amountFormatted: "$120.00" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Payout sent</h1>
      <p>Hi {{affiliateName}}, we've sent your payout of <strong>{{amountFormatted}}</strong> via the payout method on file.</p>
    `),
  },
  {
    key: "welcome_2",
    name: "Welcome #2",
    description: "Sent a few days after signup.",
    subject: "Why researchers choose EVLV",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">A bit more about EVLV, {{customerName}}</h1>
      <p>Every batch we sell is independently tested for identity and purity, with a published Certificate of Analysis (COA) you can check any time from your account.</p>
    `),
  },
  {
    key: "browse_abandonment",
    name: "Browse abandonment",
    description: "Sent after someone views a product without adding it to cart.",
    subject: "Still researching {{productName}}?",
    sampleVars: { customerName: "Jordan", productName: "BPC-157 10MG", productUrl: "https://evlvpeptides.com/shop/bpc-157-10mg" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Still deciding on {{productName}}?</h1>
      <p>Hi {{customerName}}, we noticed you checked out {{productName}} recently.</p>
      <p><a href="{{productUrl}}" style="color: #b5804a;">Take another look</a></p>
    `),
  },
  {
    key: "cart_abandonment",
    name: "Cart abandonment",
    description: "Sent after items sit in a cart without checkout.",
    subject: "You left something in your cart",
    sampleVars: { customerName: "Jordan", itemsHtml: "<li>BPC-157 10MG</li>", checkoutUrl: "https://evlvpeptides.com/checkout" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your cart is waiting, {{customerName}}</h1>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
      <p><a href="{{checkoutUrl}}" style="color: #b5804a; font-weight: 600;">Complete your order</a></p>
    `),
  },
  {
    key: "checkout_abandonment",
    name: "Checkout abandonment",
    description: "Sent after checkout is started but not completed.",
    subject: "Complete your EVLV order",
    sampleVars: { customerName: "Jordan", checkoutUrl: "https://evlvpeptides.com/checkout" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">You're almost there, {{customerName}}</h1>
      <p>Your order is still saved in your cart.<br/><a href="{{checkoutUrl}}" style="color: #b5804a; font-weight: 600;">Finish checkout</a></p>
    `),
  },
  {
    key: "payment_pending_reminder",
    name: "Payment pending reminder",
    description: "Sent while an order awaits payment confirmation.",
    subject: "Reminder: complete payment for order {{orderNumber}}",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123", paymentMethod: "zelle", paymentMemo: "EVLV-JORDAN" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your order is on hold pending payment</h1>
      <p>Hi {{customerName}}, order <strong>{{orderNumber}}</strong> is reserved but we haven't confirmed your payment yet.</p>
      <p>Payment method: {{paymentMethod}}<br/>Memo/reference: {{paymentMemo}}</p>
    `),
  },
  {
    key: "payment_confirmed",
    name: "Payment confirmed",
    description: "Sent when staff confirms payment on an order.",
    subject: "Your EVLV order {{orderNumber}} is confirmed",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Payment confirmed!</h1>
      <p>Hi {{customerName}}, we've confirmed payment on order <strong>{{orderNumber}}</strong>.</p>
    `),
  },
  {
    key: "shipping_confirmation",
    name: "Shipping confirmation",
    description: "Sent when a tracking number becomes available.",
    subject: "Your EVLV order {{orderNumber}} has shipped",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123", trackingNumber: "1Z999AA10123456784", carrierCode: "ups" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your order is on its way</h1>
      <p>Hi {{customerName}}, order <strong>{{orderNumber}}</strong> has shipped via {{carrierCode}}.</p>
      <p>Tracking number: <strong>{{trackingNumber}}</strong></p>
    `),
  },
  {
    key: "post_purchase",
    name: "Post-purchase",
    description: "Sent a few days after an order completes.",
    subject: "How's your EVLV order treating you?",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Hope research is going well, {{customerName}}</h1>
      <p>Just checking in on order <strong>{{orderNumber}}</strong>.</p>
    `),
  },
  {
    key: "win_back",
    name: "Win-back",
    description: "Sent to contacts who haven't ordered in a while.",
    subject: "We miss you at EVLV",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">It's been a while, {{customerName}}</h1>
      <p>We've added new products and every batch is still independently tested.</p>
    `),
  },
  {
    key: "vip_thank_you",
    name: "VIP thank you",
    description: "Sent when a contact's trailing spend crosses the VIP threshold.",
    subject: "Thank you for being an EVLV regular",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">You're one of our best, {{customerName}}</h1>
      <p>We wanted to say thanks for being a repeat EVLV customer.</p>
    `),
  },
  {
    key: "heroes_discount_received",
    name: "Heroes Discount application received",
    description: "Sent right after someone submits the Heroes Discount form.",
    subject: "We've got your Heroes Discount application",
    sampleVars: { name: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks, {{name}}</h1>
      <p>We've received your Heroes Discount application. We'll follow up within a couple of business days.</p>
    `),
  },
  {
    key: "heroes_discount_approved",
    name: "Heroes Discount approved",
    description: "Sent when a Heroes Discount application is approved.",
    subject: "You're approved for the EVLV Heroes Discount",
    sampleVars: { name: "Jordan", couponCode: "HEROES-AB12CD34" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thank you for your service, {{name}}</h1>
      <p>Your personal 20% off code is: <strong style="font-size: 18px; letter-spacing: 0.05em;">{{couponCode}}</strong></p>
    `),
  },
  {
    key: "heroes_discount_rejected",
    name: "Heroes Discount rejected",
    description: "Sent when a Heroes Discount application is rejected.",
    subject: "Update on your Heroes Discount application",
    sampleVars: { name: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your Heroes Discount application</h1>
      <p>Hi {{name}}, we weren't able to verify your proof of service. Reply to this email if you think this was a mistake.</p>
    `),
  },
  {
    key: "newsletter_subscribed",
    name: "Newsletter subscription confirmed",
    description: "Sent right after someone subscribes to the newsletter.",
    subject: "You're subscribed -- here's 20% off",
    sampleVars: { customerName: "Jordan", couponCode: "WELCOME20-AB12CD34", unsubscribeFooterHtml: "" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">You're on the list</h1>
      <p>Thanks, {{customerName}} -- here's 20% off your first purchase:</p>
      <p style="font-size: 18px; font-weight: 700; letter-spacing: 0.05em;">{{couponCode}}</p>
      {{{unsubscribeFooterHtml}}}
    `),
  },
  {
    key: "membership_received",
    name: "Membership request received",
    description: "Sent right after someone requests Member access.",
    subject: "We've got your Membership request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks, {{customerName}}</h1>
      <p>We've received your request for Member access. We'll follow up within a couple of business days.</p>
    `),
  },
  {
    key: "membership_approved",
    name: "Membership approved",
    description: "Sent when a Membership request is approved.",
    subject: "You're an EVLV Member!",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Welcome as a Member, {{customerName}}!</h1>
      <p>Member-exclusive research blends are now unlocked on your account.</p>
    `),
  },
  {
    key: "membership_rejected",
    name: "Membership rejected",
    description: "Sent when a Membership request is rejected.",
    subject: "Update on your EVLV Membership request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your Membership request</h1>
      <p>Hi {{customerName}}, we're not able to approve Member access at this time.</p>
    `),
  },
  {
    key: "verification_received",
    name: "Researcher verification request received",
    description: "Sent right after someone submits the verification form.",
    subject: "We've got your verification request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks, {{customerName}}</h1>
      <p>We've received your researcher/institutional verification request. We'll follow up within a couple of business days.</p>
    `),
  },
  {
    key: "verification_approved",
    name: "Researcher verification approved",
    description: "Sent when a verification request is approved.",
    subject: "You're a verified researcher on EVLV",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">You're verified, {{customerName}}</h1>
      <p>Restricted delivery formats are now unlocked on your account.</p>
    `),
  },
  {
    key: "verification_rejected",
    name: "Researcher verification rejected",
    description: "Sent when a verification request is rejected.",
    subject: "Update on your EVLV verification request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your verification request</h1>
      <p>Hi {{customerName}}, we're not able to approve researcher/institutional verification at this time.</p>
    `),
  },
  {
    key: "account_deletion_received",
    name: "Account removal request received",
    description: "Sent right after a customer requests account removal.",
    subject: "We've got your account removal request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks, {{customerName}}</h1>
      <p>We've received your request to remove your account and personal data. We'll follow up within a couple of business days.</p>
    `),
  },
  {
    key: "account_deletion_approved",
    name: "Account removal approved",
    description: "Sent right before a customer's personal data is anonymized.",
    subject: "Your EVLV account has been removed",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your account has been removed</h1>
      <p>Hi {{customerName}}, your personal data has been removed from our system as requested.</p>
    `),
  },
  {
    key: "account_deletion_rejected",
    name: "Account removal rejected",
    description: "Sent when an account removal request is rejected.",
    subject: "Update on your account removal request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your account removal request</h1>
      <p>Hi {{customerName}}, we weren't able to process your account removal request at this time.</p>
    `),
  },
  {
    key: "support_reply",
    name: "Support reply",
    description: "Wraps a staff reply sent from the Support inbox.",
    subject: "Re: {{subject}}",
    sampleVars: { subject: "Order Question", replyHtml: "<p>Thanks for reaching out...</p>" },
    html: LAYOUT(`{{{replyHtml}}}`),
  },
];

export async function getTemplate(organizationId: string, key: string): Promise<{ subject: string; html: string }> {
  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === key);
  if (!fallback) throw new Error(`Unknown email template key: ${key}`);

  const row = await prisma.emailTemplate.findUnique({ where: { organizationId_key: { organizationId, key } } });
  return row ? { subject: row.subject, html: row.html } : { subject: fallback.subject, html: fallback.html };
}

export async function sendTemplate(organizationId: string, key: string, to: string, vars: Record<string, string>, options?: { replyTo?: string }): Promise<void> {
  const { subject, html } = await getTemplate(organizationId, key);
  const unsubscribeUrl = await buildUnsubscribeUrl(organizationId, to);
  const mergedVars = { unsubscribeUrl, preferenceCenterUrl: unsubscribeUrl, ...vars };
  await sendEmail(to, renderTemplate(subject, mergedVars), renderTemplate(html, mergedVars), options);
}

async function buildUnsubscribeUrl(organizationId: string, to: string): Promise<string> {
  const { getStorefrontUrl } = await import("./storefront-url");
  const { signUnsubscribeToken } = await import("./customer-auth");

  const contact = await prisma.contact.findUnique({
    where: { organizationId_email: { organizationId, email: to } },
  });
  const brand = contact
    ? (await prisma.contactBrandLink.findFirst({ where: { contactId: contact.id }, select: { brand: { select: { domain: true } } } }))?.brand
    : await prisma.brand.findFirst({ where: { organizationId }, select: { domain: true } });
  if (!brand?.domain) return "";

  return contact
    ? getStorefrontUrl(brand.domain, `/unsubscribe?token=${signUnsubscribeToken(contact.id)}`)
    : getStorefrontUrl(brand.domain);
}
