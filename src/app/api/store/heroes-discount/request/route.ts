import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { saveProofFromDataUrl } from "@/lib/heroes-discount-upload";
import { sendTemplate } from "@/lib/email";

export const runtime = "nodejs";

// POST /api/store/heroes-discount/request -- called by evlv-site's
// server-only proxy (/api/heroes-discount/request), same x-store-domain/
// x-store-api-key auth as /api/store/wholesale/inquiry. Stores the
// submission + proof-of-service file for manual review at /heroes-discount;
// approving it (see actions.ts) is what actually issues the 20%-off coupon.
const schema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  status: z.string().trim().min(1),
  branch: z.string().trim().min(1),
  proofFileName: z.string().trim().min(1),
  proofFileType: z.string().trim().min(1),
  proofFileDataUrl: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, email, status, branch, proofFileName, proofFileType, proofFileDataUrl } = parsed.data;

  const saved = await saveProofFromDataUrl(store.organizationId, proofFileName, proofFileType, proofFileDataUrl);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.reason }, { status: 400 });
  }

  await prisma.heroesDiscountRequest.create({
    data: {
      organizationId: store.organizationId,
      name,
      email: email.toLowerCase(),
      status,
      branch,
      proofFilename: proofFileName,
      proofMimeType: proofFileType,
      proofStoragePath: saved.storagePath,
    },
  });

  await sendTemplate(store.organizationId, "heroes_discount_received", email, { name }).catch((err) =>
    console.error("Heroes discount confirmation email failed", err)
  );

  return NextResponse.json({ ok: true });
}
