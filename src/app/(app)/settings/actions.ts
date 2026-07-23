"use server";

import { revalidatePath } from "next/cache";
import { createId } from "@/lib/id";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function regenerateApiKey() {
  const { organization } = await requireOrg();

  await prisma.organization.update({
    where: { id: organization.id },
    data: { apiKey: createId() },
  });

  revalidatePath("/settings");
  revalidatePath("/webhooks");
}
