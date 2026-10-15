"use server";

import { requireOrg } from "@/lib/session";
import { sendEmail, escapeHtml } from "@/lib/email";

export async function sendContactEmail(to: string, subject: string, body: string) {
  await requireOrg();
  if (!to || !subject.trim() || !body.trim()) throw new Error("Recipient, subject, and body are required");
  // Render plain-text body as simple HTML paragraphs
  const html = body
    .split("\n")
    .map((line) => (line.trim() ? `<p style="margin:0 0 8px">${escapeHtml(line)}</p>` : "<br>"))
    .join("\n");
  const sent = await sendEmail(to, subject.trim(), html);
  if (!sent) throw new Error("Email could not be sent — check RESEND_API_KEY / EMAIL_FROM configuration");
}
