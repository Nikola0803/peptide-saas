"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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
