import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { readProofFile } from "@/lib/heroes-discount-upload";

export const runtime = "nodejs";

// Streams a Heroes Discount proof-of-service upload to a signed-in staff
// member only -- these live outside public/ specifically so they're never
// reachable any other way (see src/lib/heroes-discount-upload.ts).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { organization } = await requireOrg();

  const request = await prisma.heroesDiscountRequest.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readProofFile(request.proofStoragePath).catch(() => null);
  if (!buffer) return NextResponse.json({ error: "File missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": request.proofMimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${request.proofFilename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
