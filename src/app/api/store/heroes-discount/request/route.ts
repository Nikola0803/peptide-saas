import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { saveProofFromDataUrl } from "@/lib/heroes-discount-upload";
import { escapeHtml, sendEmail, sendTemplate } from "@/lib/email";
import { pushNotifyHeroesDiscountRequest } from "@/lib/push-notify";

export const runtime = "nodejs";

// POST /api/store/heroes-discount/request -- called by evlv-site's
// server-only proxy (/api/heroes-discount/request), same x-store-domain/
// x-store-api-key auth as /api/store/wholesale/inquiry. Stores the
// submission + proof-of-service file for manual review at /heroes-discount;
// approving it (see actions.ts) assigns the account-based lifetime 25% benefit.
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

  // Owner alerts: phone push plus an email to the organization's notify
  // address, same pattern as wholesale inquiries. Best-effort, never
  // blocks the customer's submission.
  await pushNotifyHeroesDiscountRequest({ name, email, status, branch }).catch((err) =>
    console.error("Heroes discount push failed", err)
  );
  await prisma.organization
    .findUnique({ where: { id: store.organizationId }, select: { notifyEmail: true } })
    .then((organization) => {
      if (!organization?.notifyEmail) {
        console.warn("[heroes-discount] organization.notifyEmail not set; owner email skipped");
        return;
      }
      const base = process.env.NEXTAUTH_URL || "";
      return sendEmail(
        organization.notifyEmail,
        `New heroes discount application: ${name}`,
        `<h1>New heroes discount application</h1><p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)})</p><p>${escapeHtml(status)}, ${escapeHtml(branch)}</p><p>Proof of service is attached in the CRM.</p><p><a href="${escapeHtml(base)}/heroes-discount">Review and approve</a></p>`
      );
    })
    .catch((err) => console.error("Heroes discount owner email failed", err));

  await sendTemplate(store.organizationId, "heroes_discount_received", email, { name }).catch((err) =>
    console.error("Heroes discount confirmation email failed", err)
  );

  return NextResponse.json({ ok: true });
}
