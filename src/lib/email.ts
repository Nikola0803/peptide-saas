import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

// Every email this app sends goes through here. Provider is Resend, chosen
// because it needed the least setup ceremony (an API key + a verified
// sending domain) to get order confirmations out the door fast — swap
// `sendRaw` if that ever needs to change, nothing else in this file talks
// to Resend directly.
//
// EMAIL_FROM must be an address on a domain verified in the Resend
// dashboard (e.g. "EVLV <orders@evlvpeptides.com>") — sending from an
// unverified domain is rejected by Resend, not silently dropped.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendRaw(to: string, subject: string, html: string): Promise<void> {
  if (!resend || !process.env.EMAIL_FROM) {
    console.warn(`[email] Not configured (RESEND_API_KEY/EMAIL_FROM missing) — skipped "${subject}" to ${to}`);
    return;
  }
  const { error } = await resend.emails.send({ from: process.env.EMAIL_FROM, to, subject, html });
  if (error) {
    // Never let a failed email break the order/reply flow that triggered
    // it — every caller in this app treats sendTemplate/sendRaw as
    // best-effort and wraps it, but guard here too in case a future
    // caller doesn't.
    console.error(`[email] Send failed for "${subject}" to ${to}:`, error);
  }
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
  await sendRaw(to, renderTemplate(subject, vars), renderTemplate(html, vars));
}
