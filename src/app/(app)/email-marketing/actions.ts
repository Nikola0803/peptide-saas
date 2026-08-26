"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TEMPLATES, sendTemplate } from "@/lib/email";

export async function saveTemplate(key: string, formData: FormData) {
  const { organization } = await requireOrg();
  if (!DEFAULT_TEMPLATES.some((t) => t.key === key)) throw new Error("Unknown template key");

  const subject = String(formData.get("subject") ?? "").trim();
  const html = String(formData.get("html") ?? "");
  if (!subject || !html.trim()) throw new Error("Subject and body are required");

  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === key)!;

  await prisma.emailTemplate.upsert({
    where: { organizationId_key: { organizationId: organization.id, key } },
    update: { subject, html },
    create: { organizationId: organization.id, key, name: fallback.name, subject, html },
  });

  revalidatePath(`/email-marketing/${key}`);
  revalidatePath("/email-marketing");
}

export async function resetTemplate(key: string) {
  const { organization } = await requireOrg();
  await prisma.emailTemplate.deleteMany({ where: { organizationId: organization.id, key } });
  revalidatePath(`/email-marketing/${key}`);
  revalidatePath("/email-marketing");
}

export async function sendTestEmail(key: string, formData: FormData) {
  const { organization } = await requireOrg();
  const to = String(formData.get("testEmail") ?? "").trim();
  if (!to) throw new Error("Enter an email address to send the test to");

  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === key);
  if (!fallback) throw new Error("Unknown template key");

  await sendTemplate(organization.id, key, to, fallback.sampleVars);
}

export async function saveEmailSettings(formData: FormData) {
  const { organization } = await requireOrg();

  const notifyEmail = String(formData.get("notifyEmail") ?? "").trim();
  const mailchimpApiKey = String(formData.get("mailchimpApiKey") ?? "").trim();
  const mailchimpAudienceId = String(formData.get("mailchimpAudienceId") ?? "").trim();

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      notifyEmail: notifyEmail || null,
      mailchimpApiKey: mailchimpApiKey || null,
      mailchimpAudienceId: mailchimpAudienceId || null,
    },
  });

  revalidatePath("/email-marketing");
}
