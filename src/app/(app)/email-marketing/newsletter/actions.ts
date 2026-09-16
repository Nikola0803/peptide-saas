"use server";

import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderTemplate, unsubscribeFooterHtml } from "@/lib/email";
import { signUnsubscribeToken } from "@/lib/customer-auth";
import { getStorefrontUrl } from "@/lib/storefront-url";

// In-house newsletter sender — same Resend account and Contact list this
// app already has for transactional email, no separate Mailchimp
// subscription. One request per recipient with a small delay between each
// to stay under Resend's rate limit; for a real list this can take
// minutes, way past what a form submission / nginx proxy should be left
// waiting on, so the send loop is deliberately NOT awaited here — it keeps
// running in this Node process after the action returns (this app runs
// under pm2 as a long-lived process, not serverless, so that's safe) and
// writes the Newsletter record when it finishes. Refresh the page to see
// it land.
const SEND_DELAY_MS = 150;

export async function sendNewsletter(formData: FormData) {
  const { organization } = await requireOrg();

  const subject = String(formData.get("subject") ?? "").trim();
  const html = String(formData.get("html") ?? "");
  if (!subject || !html.trim()) throw new Error("Subject and body are required");

  const recipients = await prisma.contact.findMany({
    where: { organizationId: organization.id, marketingOptIn: true },
    select: {
      id: true,
      email: true,
      name: true,
      brandLinks: { take: 1, select: { brand: { select: { domain: true } } } },
    },
  });
  if (recipients.length === 0) throw new Error("No opted-in contacts to send to");

  sendToAll(organization.id, subject, html, recipients).catch((err) => console.error("Newsletter send failed", err));
}

async function sendToAll(
  organizationId: string,
  subject: string,
  html: string,
  recipients: { id: string; email: string; name: string | null; brandLinks: { brand: { domain: string } }[] }[]
) {
  let failedCount = 0;
  for (const r of recipients) {
    // Bulk/campaign email is exactly the "marketing" category CAN-SPAM
    // requires an unsubscribe link on -- transactional email (order
    // confirmations, support replies) doesn't carry this, see
    // unsubscribeFooterHtml()'s doc comment.
    const brandDomain = r.brandLinks[0]?.brand.domain;
    const footer = brandDomain
      ? unsubscribeFooterHtml(getStorefrontUrl(brandDomain, `/unsubscribe?token=${signUnsubscribeToken(r.id)}`))
      : "";
    const body = renderTemplate(html, { customerName: r.name || r.email }) + footer;
    const ok = await sendEmail(r.email, subject, body);
    if (!ok) failedCount += 1;
    await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
  }

  await prisma.newsletter.create({
    data: { organizationId, subject, html, recipientCount: recipients.length, failedCount },
  });
  // Not revalidatePath()'d here -- this runs after the triggering action's
  // response already went out, past the point that's meaningful for. The
  // page is rendered fresh on every visit anyway (requireOrg() makes it
  // dynamic), so a manual refresh picks this up once it's done.
}
