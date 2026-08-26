"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { subscribeToMailchimp, mailchimpConfigured } from "@/lib/mailchimp";

export async function updateContact(contactId: string, formData: FormData) {
  const { organization } = await requireOrg();
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId: organization.id } });
  if (!contact) throw new Error("Not found");

  const name = String(formData.get("name") ?? "").trim();
  const marketingOptIn = formData.get("marketingOptIn") === "on";

  await prisma.contact.update({
    where: { id: contactId },
    data: { name: name || null, marketingOptIn },
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
}

export async function syncContactToMailchimp(contactId: string): Promise<{ ok: boolean; reason?: string }> {
  const { organization } = await requireOrg();
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId: organization.id } });
  if (!contact) throw new Error("Not found");
  if (!mailchimpConfigured()) return { ok: false, reason: "Mailchimp isn't configured for this org yet" };
  if (!contact.marketingOptIn) return { ok: false, reason: "This contact hasn't opted in to marketing" };

  const [firstName, ...rest] = (contact.name ?? "").split(" ");
  const result = await subscribeToMailchimp(contact.email, { firstName: firstName || undefined, lastName: rest.join(" ") || undefined });

  if (result.ok) {
    await prisma.contact.update({ where: { id: contactId }, data: { mailchimpSyncedAt: new Date() } });
    revalidatePath(`/contacts/${contactId}`);
    return { ok: true };
  }
  return { ok: false, reason: result.reason };
}
