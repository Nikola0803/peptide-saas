import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";

// Files live on disk under public/uploads/<orgId>/, served directly by
// Next.js as static assets -- no S3/cloud storage needed for a single VPS
// deployment. Filenames are prefixed with a random id so two uploads named
// the same thing never collide and a client can't control the path (no
// directory traversal via a crafted filename).
export const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export const MAX_MEDIA_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

export type MediaCategory = "image" | "video" | "document";

export function categorizeMimeType(mimeType: string): MediaCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

// Writes a validated file to disk and creates its Media row. Shared by the
// media library uploader and anywhere else that needs to accept a file
// (e.g. COA uploads) without duplicating storage/validation logic.
export async function saveUploadedFile(
  organizationId: string,
  file: File
): Promise<{ ok: true; media: Awaited<ReturnType<typeof prisma.media.create>> } | { ok: false; reason: string }> {
  if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
    return { ok: false, reason: `${file.name} (unsupported type ${file.type || "unknown"})` };
  }
  if (file.size > MAX_MEDIA_SIZE_BYTES) {
    return { ok: false, reason: `${file.name} (over 15MB)` };
  }

  const dir = path.join(process.cwd(), "public", "uploads", organizationId);
  await mkdir(dir, { recursive: true });

  const id = createId().slice(0, 12);
  const filename = `${id}-${sanitizeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const media = await prisma.media.create({
    data: {
      organizationId,
      url: `/uploads/${organizationId}/${filename}`,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  return { ok: true, media };
}

export async function deleteMediaFile(url: string) {
  const filePath = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  await unlink(filePath).catch(() => {
    // Row is already gone either way -- a missing file on disk shouldn't
    // block removing it from the library.
  });
}
