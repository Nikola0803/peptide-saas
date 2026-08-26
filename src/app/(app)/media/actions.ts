"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "application/pdf"]);
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

// Files live on disk under public/uploads/<orgId>/, served directly by
// Next.js as static assets -- no S3/cloud storage needed for a single VPS
// deployment. Filenames are prefixed with a random id so two uploads
// named the same thing never collide and a client can't control the path
// (no directory traversal via a crafted filename).
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

export async function uploadMedia(formData: FormData): Promise<{ uploaded: number; skipped: string[] }> {
  const { organization } = await requireOrg();

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Choose at least one file");

  const dir = path.join(process.cwd(), "public", "uploads", organization.id);
  await mkdir(dir, { recursive: true });

  const skipped: string[] = [];
  let uploaded = 0;

  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      skipped.push(`${file.name} (unsupported type ${file.type || "unknown"})`);
      continue;
    }
    if (file.size > MAX_SIZE_BYTES) {
      skipped.push(`${file.name} (over 15MB)`);
      continue;
    }

    const id = createId().slice(0, 12);
    const filename = `${id}-${sanitizeFilename(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    await prisma.media.create({
      data: {
        organizationId: organization.id,
        url: `/uploads/${organization.id}/${filename}`,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });
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

  const filePath = path.join(process.cwd(), "public", media.url.replace(/^\//, ""));
  await unlink(filePath).catch(() => {
    // Row is already gone either way -- a missing file on disk shouldn't
    // block removing it from the library.
  });

  revalidatePath("/media");
}
