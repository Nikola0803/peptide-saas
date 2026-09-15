import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { createId } from "@/lib/id";

// Proof-of-service uploads (ID / DD-214 / badge photos) are sensitive --
// unlike src/lib/upload.ts's media library, these never live under public/
// and are only ever read back through an authenticated admin route
// (src/app/api/heroes-discount-proof/[id]/route.ts).
const MAX_BYTES = 8 * 1024 * 1024; // 8MB, matches evlv-site's own client-side cap

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

export async function saveProofFromDataUrl(
  organizationId: string,
  filename: string,
  mimeType: string,
  dataUrl: string
): Promise<{ ok: true; storagePath: string } | { ok: false; reason: string }> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return { ok: false, reason: "Malformed file data" };

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_BYTES) return { ok: false, reason: "File is too large (over 8MB)" };
  if (buffer.byteLength === 0) return { ok: false, reason: "File is empty" };

  const dir = path.join(process.cwd(), "private-uploads", "heroes-discount", organizationId);
  await mkdir(dir, { recursive: true });

  const id = createId().slice(0, 12);
  const storedName = `${id}-${sanitizeFilename(filename || "proof")}`;
  const storagePath = path.join(dir, storedName);
  await writeFile(storagePath, buffer);

  return { ok: true, storagePath };
}

export async function readProofFile(storagePath: string): Promise<Buffer> {
  return readFile(storagePath);
}
