"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile, deleteMediaFile } from "@/lib/upload";

export async function uploadMedia(formData: FormData): Promise<{ uploaded: number; skipped: string[] }> {
  const { organization } = await requireOrg();

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Choose at least one file");

  const skipped: string[] = [];
  let uploaded = 0;

  for (const file of files) {
    const result = await saveUploadedFile(organization.id, file);
    if (!result.ok) {
      skipped.push(result.reason);
      continue;
    }
    uploaded += 1;
  }

  revalidatePath("/media");
  return { uploaded, skipped };
}

export async function deleteMedia(mediaId: string) {
  const { organization } = await requireOrg();

  const media = await prisma.media.findFirst({ where: { id: mediaId, organizationId: organization.id } });
  if (!media) throw new Error("Not found");

  await prisma.media.delete({ where: { id: media.id } });
  await deleteMediaFile(media.url);

  revalidatePath("/media");
}
