import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

// Every email this app sends goes through here. Provider is Resend, chosen
// because it needed the least setup ceremony (an API key + a verified
// sending domain) to get order confirmations out the door fast — swap
// `sendEmail` if that ever needs to change, nothing else in this file
// talks to Resend directly.
//
// EMAIL_FROM must be an address on a domain verified in the Resend
// dashboard (e.g. "EVLV <orders@evlvpeptides.com>") — sending from an
// unverified domain is rejected by Resend, not silently dropped.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

// Returns whether the send actually succeeded — most callers (order/reply
// emails) don't check this and just treat the whole thing as best-effort,
// but the newsletter sender needs a real per-recipient success count.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!resend || !process.env.EMAIL_FROM) {
    console.warn(`[email] Not configured (RESEND_API_KEY/EMAIL_FROM missing) — skipped "${subject}" to ${to}`);
    return false;
  }
  const { error } = await resend.emails.send({ from: process.env.EMAIL_FROM, to, subject, html });
  if (error) {
    console.error(`[email] Send failed for "${subject}" to ${to}:`, error);
    return false;
  }
  return true;
}

// {{variableName}} substitution — deliberately not a templating engine
// (no loops/conditionals). Every value gets HTML-escaped except ones
// wrapped as {{{rawHtml}}} (e.g. a pre-built order-items table), matching
// the common "double braces escapes, triple doesn't" convention so a
// customer's own name/address can't inject markup into their own email.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => vars[key] ?? "")
    .replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] ?? ""));
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

// Built-in fallback for every template this app sends — used whenever no
// EmailTemplate row exists yet for that key/org, so real emails go out
// correctly from day one, before anyone has touched the Email page.
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
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123", itemsHtml: "<li>BPC-157 10MG x1 — $70.00</li>", totalFormatted: "$85.00", paymentMethod: "zelle", paymentMemo: "EVLV-JORDAN" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks for your order, {{customerName}}!</h1>
      <p>We've received order <strong>{{orderNumber}}</strong> and it's on hold pending payment confirmation.</p>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
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
    sampleVars: { customerName: "Jordan", customerEmail: "jordan@lab.edu", orderNumber: "STORE-ABC123", itemsHtml: "<li>BPC-157 10MG x1 — $70.00</li>", totalFormatted: "$85.00", paymentMethod: "zelle", paymentMemo: "EVLV-JORDAN" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">New order: {{orderNumber}}</h1>
      <p>{{customerName}} ({{customerEmail}})</p>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
      <p><strong>Total: {{totalFormatted}}</strong></p>
      <p>Payment method: {{paymentMethod}}<br/>Memo/reference to reconcile: {{paymentMemo}}</p>
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
    key: "affiliate_approved",
    name: "Affiliate application approved",
    description: "Sent when a self-serve affiliate application is approved from the Affiliates page.",
    subject: "You're approved as an EVLV affiliate!",
    sampleVars: { affiliateName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Welcome to the EVLV affiliate program, {{affiliateName}}!</h1>
      <p>Your application has been approved. Log in to your affiliate dashboard to grab your referral link, track clicks and commission, and set up how you'd like to get paid.</p>
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
      <p>Hi {{affiliateName}}, we've sent your payout of <strong>{{amountFormatted}}</strong> via the payout method on file. It should arrive shortly depending on your provider.</p>
    `),
  },
  {
    key: "support_reply",
    name: "Support reply",
    description: "Wraps a staff reply sent from the Support inbox to a contact-form or WhatsApp lead.",
    subject: "Re: {{subject}}",
    sampleVars: { subject: "Order Question", replyHtml: "<p>Thanks for reaching out — here's the answer...</p>" },
    html: LAYOUT(`{{{replyHtml}}}`),
  },
];

export async function getTemplate(organizationId: string, key: string): Promise<{ subject: string; html: string }> {
  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === key);
  if (!fallback) throw new Error(`Unknown email template key: ${key}`);

  const row = await prisma.emailTemplate.findUnique({ where: { organizationId_key: { organizationId, key } } });
  return row ? { subject: row.subject, html: row.html } : { subject: fallback.subject, html: fallback.html };
}

export async function sendTemplate(organizationId: string, key: string, to: string, vars: Record<string, string>): Promise<void> {
  const { subject, html } = await getTemplate(organizationId, key);
  await sendEmail(to, renderTemplate(subject, vars), renderTemplate(html, vars));
}
