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

// Standard unsubscribe line for marketing/bulk email -- NOT used on
// transactional email (order confirmations, support replies, program
// status emails), since those aren't "marketing" under CAN-SPAM and a
// customer needs them regardless of their opt-in state. Callers build the
// link with signUnsubscribeToken() (src/lib/customer-auth.ts) + a
// storefront URL (src/lib/storefront-url.ts) since the page it lands on
// lives on evlv-site, not this app.
export function unsubscribeFooterHtml(unsubscribeUrl: string): string {
  return `<p style="margin:24px 0 0 0;padding-top:16px;border-top:1px solid #d8d3c7;font-size:12px;line-height:1.6;color:#6b7370;">Don't want these emails? <a href="${unsubscribeUrl}" style="color:#203a37;text-decoration:underline;">Unsubscribe</a>.</p>`;
}

export interface EmailTemplateDefault {
  key: string;
  name: string;
  subject: string;
  html: string;
  description: string;
  sampleVars: Record<string, string>;
}

const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

// These templates are edited as HTML in the CRM, but the defaults should
// already look finished. Keep the typography inline because Gmail and Outlook
// strip or partially ignore stylesheet blocks.
function polishEmailBody(body: string): string {
  return body
    .replace(
      /<h1(?:\s+style="[^"]*")?>/g,
      `<h1 style="margin:0 0 18px 0;font-family:${EMAIL_FONT};font-size:30px;line-height:1.14;font-weight:650;letter-spacing:-0.5px;color:#0e1113;">`,
    )
    .replace(
      /<p>/g,
      `<p style="margin:0 0 17px 0;font-family:${EMAIL_FONT};font-size:15px;line-height:1.72;color:#40514e;">`,
    )
    .replace(
      /<ul style="padding-left:\s*18px;">/g,
      `<ul style="margin:4px 0 22px 0;padding:18px 22px 18px 40px;background:#ffffff;border:1px solid #d8d3c7;border-radius:8px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.8;color:#314743;">`,
    );
}

const EVLV_VIAL_HERO = "https://www.evlvpeptides.com/images/certified/evlv-hero-multi-vials.png";

const LAYOUT = (body: string, image = EVLV_VIAL_HERO) => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>EVLV</title>
</head>
<body style="margin:0;padding:0;background:#e7e3da;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#e7e3da;">
  <tr>
    <td align="center" style="padding:30px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#f4f1ea;border:1px solid #d8d3c7;border-radius:12px;overflow:hidden;box-shadow:0 12px 36px rgba(14,17,19,0.10);">
        <tr>
          <td style="background:#0e1113;padding:25px 30px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td align="left" style="vertical-align:middle;">
                  <img src="https://www.evlvpeptides.com/logo/evlv-logo-light.png" width="126" alt="EVLV" style="display:block;width:126px;max-width:126px;height:auto;border:0;outline:none;text-decoration:none;">
                </td>
                <td align="right" style="vertical-align:middle;font-family:${EMAIL_FONT};font-size:9px;line-height:1.4;color:#d8d3c7;letter-spacing:2.2px;text-transform:uppercase;white-space:nowrap;">
                  Research Use Only
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="height:3px;background:#b8875a;font-size:1px;line-height:1px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="background:#203a37;">
            <img src="${image}" width="640" alt="EVLV research standards" style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;text-decoration:none;">
          </td>
        </tr>
        <tr>
          <td style="padding:38px 38px 30px 38px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.7;color:#314743;">
            <p style="margin:0 0 11px 0;font-family:${EMAIL_FONT};font-size:10px;line-height:1.4;color:#a56f43;letter-spacing:2.2px;text-transform:uppercase;font-weight:700;">EVLV Client Services</p>
            ${polishEmailBody(body)}
          </td>
        </tr>
        <tr>
          <td style="padding:0 38px 30px 38px;background:#f4f1ea;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#203a37;border-radius:8px;">
              <tr>
                <td style="padding:18px 20px;font-family:${EMAIL_FONT};">
                  <p style="margin:0;font-size:11px;line-height:1.7;color:#f1eee7;letter-spacing:0.15px;">
                    <strong style="color:#ffffff;">RESEARCH USE ONLY</strong><br>
                    Products are sold strictly for laboratory and analytical research. Not for human or veterinary use.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 34px 28px 34px;background:#0e1113;text-align:center;font-family:${EMAIL_FONT};">
            <p style="margin:0 0 9px 0;font-size:11px;line-height:1.5;color:#f1eee7;letter-spacing:2px;text-transform:uppercase;font-weight:650;">EVLV Research</p>
            <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;color:#8f9693;">
              <a href="https://www.evlvpeptides.com/account" style="color:#d8d3c7;text-decoration:none;">Account</a>
              <span style="color:#6b7370;"> | </span>
              <a href="https://www.evlvpeptides.com/coas" style="color:#d8d3c7;text-decoration:none;">COA Library</a>
              <span style="color:#6b7370;"> | </span>
              <a href="https://www.evlvpeptides.com/shop" style="color:#d8d3c7;text-decoration:none;">Shop</a>
            </p>
            <p style="margin:0;font-size:11px;line-height:1.6;color:#6b7370;">
              Research use only. Not for human or veterinary use.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

// Built-in fallback for every template this app sends — used whenever no
// EmailTemplate row exists yet for that key/org, so real emails go out
// correctly from day one, before anyone has touched the Email page.
export const DEFAULT_TEMPLATES: EmailTemplateDefault[] = [
  {
    key: "welcome_customer",
    name: "Welcome (new account)",
    description: "Sent right after someone creates an account on evlv-site.",
    subject: "Welcome to EVLV, {{customerName}}",
    sampleVars: { customerName: "Jordan", couponCode: "WELCOME10-AB12CD34", welcomeDiscountPercent: "10" },
    html: `
      <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;line-height:1px;opacity:0;">
        Your EVLV research account is ready. Your personal first-order code is inside.
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#e7e3da;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#f1eee7;border:1px solid #d8d3c7;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="background:#0e1113;padding:30px 28px 24px 28px;text-align:center;">
                  <img src="https://www.evlvpeptides.com/logo/evlv-logo-light.png" width="150" alt="EVLV" style="display:block;width:150px;max-width:150px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;">
                  <p style="margin:18px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.4;color:#d8d3c7;letter-spacing:3px;text-transform:uppercase;">
                    Research Use Only
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <img src="https://www.evlvpeptides.com/images/certified/evlv-hero-multi-vials.png" width="640" alt="EVLV research collection" style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;text-decoration:none;">
                </td>
              </tr>
              <tr>
                <td style="padding:38px 34px 18px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0e1113;">
                  <p style="margin:0 0 12px 0;font-size:11px;line-height:1.4;color:#b8875a;letter-spacing:2.4px;text-transform:uppercase;font-weight:600;">
                    Account Approved
                  </p>
                  <h1 style="margin:0 0 16px 0;font-size:30px;line-height:1.12;font-weight:600;color:#0e1113;letter-spacing:0;">
                    Welcome to EVLV, {{customerName}}
                  </h1>
                  <p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:#314743;">
                    Your research account is ready. You can now review current availability, verify batch documentation, track orders, and manage account details from one place.
                  </p>
                  <p style="margin:0 0 26px 0;font-size:15px;line-height:1.65;color:#6b7370;">
                    As a first-order welcome, use your personal single-use code below at checkout.
                  </p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px 0;background:#ffffff;border:1px solid #d8d3c7;border-radius:6px;">
                    <tr>
                      <td style="padding:22px 20px;text-align:center;">
                        <p style="margin:0 0 8px 0;font-size:12px;line-height:1.4;color:#6b7370;letter-spacing:1.8px;text-transform:uppercase;font-weight:600;">
                          {{welcomeDiscountPercent}}% off first order
                        </p>
                        <p style="margin:0;font-size:24px;line-height:1.2;color:#203a37;letter-spacing:2.5px;font-weight:700;">
                          {{couponCode}}
                        </p>
                      </td>
                    </tr>
                  </table>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 32px 0;">
                    <tr>
                      <td style="background:#0e1113;border-radius:4px;">
                        <a href="https://www.evlvpeptides.com/shop" target="_blank" style="display:inline-block;padding:15px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1;color:#f1eee7;text-decoration:none;letter-spacing:1.7px;text-transform:uppercase;font-weight:600;">
                          Explore Current Collection
                        </a>
                      </td>
                    </tr>
                  </table>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
                    <tr>
                      <td style="padding:16px 0;border-top:1px solid #d8d3c7;border-bottom:1px solid #d8d3c7;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                          <tr>
                            <td width="33.33%" style="padding:0 8px 0 0;vertical-align:top;">
                              <p style="margin:0 0 6px 0;font-size:11px;line-height:1.4;color:#b8875a;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">01</p>
                              <p style="margin:0;font-size:13px;line-height:1.5;color:#203a37;font-weight:600;">Batch-backed documentation</p>
                            </td>
                            <td width="33.33%" style="padding:0 8px;vertical-align:top;">
                              <p style="margin:0 0 6px 0;font-size:11px;line-height:1.4;color:#b8875a;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">02</p>
                              <p style="margin:0;font-size:13px;line-height:1.5;color:#203a37;font-weight:600;">COA visibility before checkout</p>
                            </td>
                            <td width="33.33%" style="padding:0 0 0 8px;vertical-align:top;">
                              <p style="margin:0 0 6px 0;font-size:11px;line-height:1.4;color:#b8875a;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">03</p>
                              <p style="margin:0;font-size:13px;line-height:1.5;color:#203a37;font-weight:600;">Priority U.S. shipping over $300</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 10px 0;font-size:14px;line-height:1.7;color:#6b7370;">
                    Questions before your first order? Reply to this email and the EVLV team will help.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#203a37;padding:22px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                  <p style="margin:0;font-size:12px;line-height:1.7;color:#f1eee7;">
                    EVLV products are sold strictly for laboratory and analytical research use only. Not for human or veterinary use.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 34px 28px 34px;background:#0e1113;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                  <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#d8d3c7;letter-spacing:1.6px;text-transform:uppercase;">EVLV Peptides</p>
                  <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;color:#8f9693;">
                    <a href="https://www.evlvpeptides.com/account" style="color:#d8d3c7;text-decoration:none;">Account</a>
                    <span style="color:#6b7370;"> | </span>
                    <a href="https://www.evlvpeptides.com/coas" style="color:#d8d3c7;text-decoration:none;">COA Library</a>
                    <span style="color:#6b7370;"> | </span>
                    <a href="https://www.evlvpeptides.com/shop" style="color:#d8d3c7;text-decoration:none;">Shop</a>
                  </p>
                  <p style="margin:0;font-size:11px;line-height:1.6;color:#6b7370;">
                    <a href="{{unsubscribeUrl}}" style="color:#8f9693;text-decoration:underline;">Unsubscribe</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
  },
  {
    key: "order_confirmation_customer",
    name: "Order confirmation (customer)",
    description: "Sent to the customer right after checkout.",
    subject: "Your EVLV order {{orderNumber}} is confirmed",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123", itemsHtml: "<li>BPC-157 10MG x1 — $70.00</li>", shippingFormatted: "$15.00", totalFormatted: "$85.00", paymentMethod: "zelle", paymentMemo: "EVLV-JORDAN" },
    html: LAYOUT(`
      <h1>Order received, {{customerName}}</h1>
      <p>Your EVLV order <strong>{{orderNumber}}</strong> is reserved and awaiting payment confirmation. A second email will arrive as soon as payment is matched.</p>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background:#ffffff;border:1px solid #d8d3c7;border-radius:8px;">
        <tr>
          <td style="padding:18px 20px;border-bottom:1px solid #e7e3da;font-family:${EMAIL_FONT};font-size:13px;color:#6b7370;">Shipping</td>
          <td align="right" style="padding:18px 20px;border-bottom:1px solid #e7e3da;font-family:${EMAIL_FONT};font-size:14px;color:#203a37;font-weight:650;">{{shippingFormatted}}</td>
        </tr>
        <tr>
          <td style="padding:18px 20px;font-family:${EMAIL_FONT};font-size:13px;color:#6b7370;">Order total</td>
          <td align="right" style="padding:18px 20px;font-family:${EMAIL_FONT};font-size:21px;color:#0e1113;font-weight:700;">{{totalFormatted}}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background:#ece8df;border-left:3px solid #b8875a;">
        <tr>
          <td style="padding:16px 18px;font-family:${EMAIL_FONT};font-size:13px;line-height:1.75;color:#314743;">
            <strong>Payment method:</strong> {{paymentMethod}}<br>
            <strong>Memo / reference:</strong> {{paymentMemo}}
          </td>
        </tr>
      </table>
      <p>Once payment is confirmed, your order moves into preparation. Reply directly to this email if you need assistance.</p>
    `, EVLV_VIAL_HERO),
  },
  {
    key: "order_confirmation_office",
    name: "New order notification (office)",
    description: "Sent internally to the office/ops inbox whenever an order comes in.",
    subject: "New order {{orderNumber}} — {{totalFormatted}}",
    sampleVars: { customerName: "Jordan", customerEmail: "jordan@lab.edu", orderNumber: "STORE-ABC123", itemsHtml: "<li>BPC-157 10MG x1 — $70.00</li>", shippingFormatted: "$15.00", totalFormatted: "$85.00", paymentMethod: "zelle", paymentMemo: "EVLV-JORDAN" },
    html: LAYOUT(`
      <h1>New order: {{orderNumber}}</h1>
      <p>{{customerName}} ({{customerEmail}})</p>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;background:#ffffff;border:1px solid #d8d3c7;border-radius:8px;">
        <tr><td style="padding:12px 16px;color:#6b7370;">Shipping</td><td align="right" style="padding:12px 16px;font-weight:650;">{{shippingFormatted}}</td></tr>
        <tr><td style="padding:12px 16px;border-top:1px solid #e7e3da;color:#6b7370;">Total</td><td align="right" style="padding:12px 16px;border-top:1px solid #e7e3da;font-size:18px;font-weight:700;">{{totalFormatted}}</td></tr>
      </table>
      <p><strong>Payment:</strong> {{paymentMethod}}<br><strong>Reconcile using:</strong> {{paymentMemo}}</p>
    `),
  },
  {
    key: "contact_form_received",
    name: "New contact form message (office)",
    description: "Sent internally whenever a visitor submits the storefront contact form -- the only email copy of a lead if nobody happens to check the Support inbox or have push notifications set up.",
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
    description: "Sent to the office/ops inbox when a dropship supplier generates an invoice from their portal.",
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
    description: "Sent to the office/ops inbox when a dropship supplier uploads a COA for one of his products, awaiting publish.",
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
      <p>Hi {{supplierName}}, we've marked your invoice for <strong>{{totalFormatted}}</strong> as paid. Thanks for keeping orders moving!</p>
    `),
  },
  {
    key: "affiliate_approved",
    name: "Affiliate application approved",
    description: "Sent when a self-serve affiliate application is approved from the Affiliates page.",
    subject: "You're approved as an EVLV affiliate!",
    sampleVars: { affiliateName: "Jordan" },
    html: LAYOUT(`
      <h1>Welcome to the EVLV affiliate program, {{affiliateName}}</h1>
      <p>Your application has been approved. Log in to your affiliate dashboard to grab your referral link, track clicks and commission, and set up how you'd like to get paid.</p>
      <p><a href="https://www.evlvpeptides.com/partner" style="display:inline-block;background:#0e1113;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:5px;font-weight:650;letter-spacing:0.8px;">OPEN PARTNER COMMAND CENTER</a></p>
    `, EVLV_VIAL_HERO),
  },
  {
    key: "affiliate_rejected",
    name: "Affiliate application rejected",
    description: "Sent when a self-serve affiliate application is rejected from the Affiliates page.",
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
    description: "Sent when a wholesale inquiry is linked & approved from the Wholesale page.",
    subject: "You're approved as an EVLV wholesale partner",
    sampleVars: { contactName: "Jordan", companyName: "Acme Labs" },
    html: LAYOUT(`
      <h1>Welcome as an EVLV wholesale partner, {{contactName}}</h1>
      <p>{{companyName}}'s wholesale inquiry has been approved. We'll be in touch with next steps, or reply to this email with any questions in the meantime.</p>
    `, EVLV_VIAL_HERO),
  },
  {
    key: "wholesale_rejected",
    name: "Wholesale inquiry rejected",
    description: "Sent when a wholesale inquiry is rejected from the Wholesale page.",
    subject: "Update on your EVLV wholesale inquiry",
    sampleVars: { contactName: "Jordan", companyName: "Acme Labs" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your wholesale inquiry</h1>
      <p>Hi {{contactName}}, thanks for {{companyName}}'s interest in an EVLV wholesale partnership. We're not able to move forward at this time.</p>
      <p>If your situation changes, feel free to reach back out any time.</p>
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
    key: "welcome_2",
    name: "Welcome #2",
    description: "Sent a few days after signup (see the Email page's Automations section for timing) -- why EVLV, testing/quality, product categories.",
    subject: "Why researchers choose EVLV",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1>A bit more about EVLV, {{customerName}}</h1>
      <p>Every batch we sell is independently tested for identity and purity, with a published Certificate of Analysis (COA) you can check any time from your account.</p>
      <p>We carry both single-compound peptides and pre-combined research blends -- browse the full catalog any time from the Shop page.</p>
      <p>Questions about a specific compound or protocol? Just reply to this email.</p>
      <p><a href="https://www.evlvpeptides.com/coas" style="display:inline-block;background:#0e1113;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:5px;font-weight:650;letter-spacing:0.8px;">EXPLORE BATCH DOCUMENTATION</a></p>
    `, EVLV_VIAL_HERO),
  },
  {
    key: "browse_abandonment",
    name: "Browse abandonment",
    description: "Sent after someone views a product without adding it to cart (see Automations for timing).",
    subject: "Still researching {{productName}}?",
    sampleVars: { customerName: "Jordan", productName: "BPC-157 10MG", productUrl: "https://evlvpeptides.com/shop/bpc-157-10mg" },
    html: LAYOUT(`
      <h1>Still researching {{productName}}?</h1>
      <p>Hi {{customerName}}, we noticed you checked out {{productName}} recently. It's independently tested and ready to ship whenever you are.</p>
      <p><a href="{{productUrl}}" style="display:inline-block;background:#0e1113;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:5px;font-weight:650;letter-spacing:0.8px;">VIEW PRODUCT &amp; COA</a></p>
    `, "https://www.evlvpeptides.com/images/certified/evlv-hero-multi-vials.png"),
  },
  {
    key: "cart_abandonment",
    name: "Cart abandonment",
    description: "Sent after items sit in a cart without checkout (see Automations for timing).",
    subject: "You left something in your cart",
    sampleVars: { customerName: "Jordan", itemsHtml: "<li>BPC-157 10MG</li>", checkoutUrl: "https://evlvpeptides.com/checkout" },
    html: LAYOUT(`
      <h1>Your research cart is saved, {{customerName}}</h1>
      <ul style="padding-left: 18px;">{{{itemsHtml}}}</ul>
      <p>Availability can change between batches. Your selections are ready when you are.</p>
      <p><a href="{{checkoutUrl}}" style="display:inline-block;background:#0e1113;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:5px;font-weight:650;letter-spacing:0.8px;">RETURN TO CHECKOUT</a></p>
    `, "https://www.evlvpeptides.com/images/certified/evlv-hero-multi-vials.png"),
  },
  {
    key: "checkout_abandonment",
    name: "Checkout abandonment",
    description: "Sent after checkout is started but not completed (see Automations for timing).",
    subject: "Complete your EVLV order",
    sampleVars: { customerName: "Jordan", checkoutUrl: "https://evlvpeptides.com/checkout" },
    html: LAYOUT(`
      <h1>You're almost there, {{customerName}}</h1>
      <p>Your order is still saved in your cart -- it only takes a minute to finish checking out.</p>
      <p><a href="{{checkoutUrl}}" style="display:inline-block;background:#0e1113;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:5px;font-weight:650;letter-spacing:0.8px;">FINISH CHECKOUT</a></p>
    `, EVLV_VIAL_HERO),
  },
  {
    key: "payment_pending_reminder",
    name: "Payment pending reminder",
    description: "Sent while an order awaits payment confirmation (see Automations for timing).",
    subject: "Reminder: complete payment for order {{orderNumber}}",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123", paymentMethod: "zelle", paymentMemo: "EVLV-JORDAN" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your order is on hold pending payment</h1>
      <p>Hi {{customerName}}, order <strong>{{orderNumber}}</strong> is reserved but we haven't confirmed your payment yet.</p>
      <p>Payment method: {{paymentMethod}}<br/>Memo/reference: {{paymentMemo}}</p>
      <p>If we don't receive payment soon, the reserved stock is released back and someone else may purchase it -- reply to this email if you've already paid and it hasn't been confirmed.</p>
    `),
  },
  {
    key: "payment_confirmed",
    name: "Payment confirmed",
    description: "Sent the moment staff confirms payment on an order.",
    subject: "Your EVLV order {{orderNumber}} is confirmed",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123" },
    html: LAYOUT(`
      <h1>Payment confirmed</h1>
      <p>Hi {{customerName}}, we've confirmed payment on order <strong>{{orderNumber}}</strong>. It's now being prepared for shipment -- we'll email you tracking as soon as it ships.</p>
    `, EVLV_VIAL_HERO),
  },
  {
    key: "shipping_confirmation",
    name: "Shipping confirmation",
    description: "Sent when a tracking number becomes available for an order.",
    subject: "Your EVLV order {{orderNumber}} has shipped",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123", trackingNumber: "1Z999AA10123456784", carrierCode: "ups" },
    html: LAYOUT(`
      <h1>Your order is on its way</h1>
      <p>Hi {{customerName}}, order <strong>{{orderNumber}}</strong> has shipped via {{carrierCode}}.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;background:#ffffff;border:1px solid #d8d3c7;border-radius:8px;"><tr><td style="padding:20px;text-align:center;"><p style="margin:0 0 7px 0;font-size:10px;letter-spacing:1.8px;color:#a56f43;text-transform:uppercase;font-weight:700;">Tracking number</p><p style="margin:0;font-size:18px;color:#203a37;font-weight:700;letter-spacing:0.8px;">{{trackingNumber}}</p></td></tr></table>
    `, EVLV_VIAL_HERO),
  },
  {
    key: "post_purchase",
    name: "Post-purchase",
    description: "Sent a few days after an order completes (see Automations for timing) -- COA/docs and account reminder.",
    subject: "How's your EVLV order treating you?",
    sampleVars: { customerName: "Jordan", orderNumber: "STORE-ABC123" },
    html: LAYOUT(`
      <h1>Documentation for your EVLV order</h1>
      <p>Just checking in on order <strong>{{orderNumber}}</strong>. A reminder that every batch's Certificate of Analysis is available any time from your account page.</p>
      <p>Questions about storage, reconstitution, or anything else? Just reply to this email.</p>
      <p><a href="https://www.evlvpeptides.com/coas" style="display:inline-block;background:#0e1113;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:5px;font-weight:650;letter-spacing:0.8px;">VIEW COA LIBRARY</a></p>
    `, EVLV_VIAL_HERO),
  },
  {
    key: "win_back",
    name: "Win-back",
    description: "Sent to contacts who haven't ordered in a while (see Automations for timing).",
    subject: "We miss you at EVLV",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1>See what's new at EVLV, {{customerName}}</h1>
      <p>We've added new products and every batch is still independently tested with a published COA. Come take a look at what's new.</p>
      <p><a href="https://www.evlvpeptides.com/shop" style="display:inline-block;background:#0e1113;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:5px;font-weight:650;letter-spacing:0.8px;">EXPLORE CURRENT AVAILABILITY</a></p>
    `, "https://www.evlvpeptides.com/images/certified/evlv-hero-multi-vials.png"),
  },
  {
    key: "vip_thank_you",
    name: "VIP thank you",
    description: "Sent to contacts whose trailing-90-day spend crosses the VIP threshold (set on the Email page).",
    subject: "Thank you for being an EVLV regular",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">You're one of our best, {{customerName}}</h1>
      <p>We wanted to say thanks for being a repeat EVLV customer -- your continued trust means a lot. Reach out any time if there's ever anything we can do for you.</p>
    `),
  },
  {
    key: "heroes_discount_received",
    name: "Heroes Discount application received",
    description: "Sent right after someone submits the Heroes Discount form on evlv-site, before review.",
    subject: "We've got your Heroes Discount application",
    sampleVars: { name: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks, {{name}}</h1>
      <p>We've received your Heroes Discount application along with your proof of service. We review every application by hand -- we'll follow up by email within a couple of business days.</p>
    `),
  },
  {
    key: "heroes_discount_approved",
    name: "Heroes Discount approved",
    description: "Sent when a Heroes Discount application is approved from the Heroes Discount page, with the personal coupon code.",
    subject: "You're approved for the EVLV Heroes Discount",
    sampleVars: { name: "Jordan", couponCode: "HEROES-AB12CD34" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thank you for your service, {{name}}</h1>
      <p>Your Heroes Discount application has been approved. Your personal 20% off code is:</p>
      <p style="font-size: 18px; font-weight: 700; letter-spacing: 0.05em;">{{couponCode}}</p>
      <p>It's single-use and tied to your account -- it'll apply automatically at checkout when you're signed in.</p>
    `),
  },
  {
    key: "heroes_discount_rejected",
    name: "Heroes Discount rejected",
    description: "Sent when a Heroes Discount application is rejected from the Heroes Discount page.",
    subject: "Update on your Heroes Discount application",
    sampleVars: { name: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your Heroes Discount application</h1>
      <p>Hi {{name}}, we weren't able to verify your proof of service for the Heroes Discount. If you think this was a mistake, reply to this email and we're happy to take another look.</p>
    `),
  },
  {
    key: "newsletter_subscribed_10",
    name: "Newsletter subscription confirmed",
    description: "Sent right after someone subscribes to the newsletter (evlv-site's footer signup or checkout opt-in), with their welcome coupon code.",
    subject: "You're subscribed -- here's {{welcomeDiscountPercent}}% off",
    sampleVars: { customerName: "Jordan", couponCode: "WELCOME10-AB12CD34", welcomeDiscountPercent: "10", unsubscribeFooterHtml: "" },
    html: LAYOUT(`
      <p style="margin:0 0 12px 0;font-size:11px;line-height:1.4;color:#b8875a;letter-spacing:2.2px;text-transform:uppercase;font-weight:600;">Research List Confirmed</p>
      <h1 style="margin:0 0 16px 0;font-size:26px;line-height:1.18;font-weight:600;color:#0e1113;letter-spacing:0;">You're on the EVLV list, {{customerName}}</h1>
      <p style="margin:0 0 20px 0;">We'll email you when there is something worth sharing: batch availability, product updates, COA notes, and occasional research-only offers.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;background:#ffffff;border:1px solid #d8d3c7;border-radius:6px;">
        <tr>
          <td style="padding:20px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:12px;line-height:1.4;color:#6b7370;letter-spacing:1.8px;text-transform:uppercase;font-weight:600;">{{welcomeDiscountPercent}}% off first order</p>
            <p style="margin:0;font-size:23px;line-height:1.2;color:#203a37;letter-spacing:2.2px;font-weight:700;">{{couponCode}}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0;">This code is single-use and tied to your email. GLP series offers may stack with it up to the 30% retail maximum.</p>
      {{{unsubscribeFooterHtml}}}
    `),
  },
  {
    key: "membership_received",
    name: "Membership request received",
    description: "Sent right after someone requests Member access from evlv-site's /plans page, before review.",
    subject: "We've got your Membership request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks, {{customerName}}</h1>
      <p>We've received your request for Member access. We review every request by hand -- we'll follow up by email within a couple of business days.</p>
    `),
  },
  {
    key: "membership_approved",
    name: "Membership approved",
    description: "Sent when a Membership request is approved from the Membership page.",
    subject: "You're an EVLV Member!",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Welcome as a Member, {{customerName}}!</h1>
      <p>Your Member access has been approved -- member-exclusive research blends are now unlocked on your account. Sign in and take a look at the Shop any time.</p>
    `),
  },
  {
    key: "membership_rejected",
    name: "Membership rejected",
    description: "Sent when a Membership request is rejected from the Membership page.",
    subject: "Update on your EVLV Membership request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your Membership request</h1>
      <p>Hi {{customerName}}, we're not able to approve Member access at this time. If you think this was a mistake, reply to this email.</p>
    `),
  },
  {
    key: "verification_received",
    name: "Researcher verification request received",
    description: "Sent right after someone submits the verification form on evlv-site's /account page, before review.",
    subject: "We've got your verification request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks, {{customerName}}</h1>
      <p>We've received your researcher/institutional verification request. We review every request by hand -- we'll follow up by email within a couple of business days.</p>
    `),
  },
  {
    key: "verification_approved",
    name: "Researcher verification approved",
    description: "Sent when a verification request is approved from the Verification page.",
    subject: "You're a verified researcher on EVLV",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">You're verified, {{customerName}}</h1>
      <p>Your researcher/institutional verification has been approved -- restricted delivery formats are now unlocked on your account.</p>
    `),
  },
  {
    key: "verification_rejected",
    name: "Researcher verification rejected",
    description: "Sent when a verification request is rejected from the Verification page.",
    subject: "Update on your EVLV verification request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your verification request</h1>
      <p>Hi {{customerName}}, we're not able to approve researcher/institutional verification at this time. If you think this was a mistake, reply to this email.</p>
    `),
  },
  {
    key: "account_deletion_received",
    name: "Account removal request received",
    description: "Sent right after a customer requests account removal from evlv-site's /account page, before review.",
    subject: "We've got your account removal request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Thanks, {{customerName}}</h1>
      <p>We've received your request to remove your account and personal data. We review every request by hand -- we'll follow up by email within a couple of business days once it's processed.</p>
      <p>Order records are kept for accounting purposes as required by law, but your personal details (name, email) will be removed from our system.</p>
    `),
  },
  {
    key: "account_deletion_approved",
    name: "Account removal approved",
    description: "Sent right before a customer's personal data is anonymized, from the Account Removal page.",
    subject: "Your EVLV account has been removed",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your account has been removed</h1>
      <p>Hi {{customerName}}, your personal data has been removed from our system as requested. You won't receive any further emails from us.</p>
      <p>Order records are retained in anonymized form for accounting purposes as required by law.</p>
    `),
  },
  {
    key: "account_deletion_rejected",
    name: "Account removal rejected",
    description: "Sent when an account removal request is rejected from the Account Removal page.",
    subject: "Update on your account removal request",
    sampleVars: { customerName: "Jordan" },
    html: LAYOUT(`
      <h1 style="font-size: 20px;">Your account removal request</h1>
      <p>Hi {{customerName}}, we weren't able to process your account removal request at this time. If you think this was a mistake, reply to this email.</p>
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

export async function sendTemplate(organizationId: string, key: string, to: string, vars: Record<string, string>, options?: { replyTo?: string }): Promise<boolean> {
  const { subject, html } = await getTemplate(organizationId, key);
  const unsubscribeUrl = await buildUnsubscribeUrl(organizationId, to);
  const mergedVars = { unsubscribeUrl, preferenceCenterUrl: unsubscribeUrl, ...vars };
  return sendEmail(to, renderTemplate(subject, mergedVars), renderTemplate(html, mergedVars), options);
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
