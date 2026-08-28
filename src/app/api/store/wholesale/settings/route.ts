import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { resolveContactFromToken } from "@/lib/store-customer";

const bodySchema = z.object({
  token: z.string().optional(),
  notificationEmail: z.string().email(),
  businessName: z.string().optional(),
});

// POST /api/store/wholesale/settings { token, notificationEmail, businessName? }
// Deliberately a separate inbox from the account's login email -- ops/
// billing may not be the same person as whoever signs in.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const contact = await resolveContactFromToken(req, store, raw);
  if (!contact) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const partner = await prisma.wholesalePartner.findUnique({ where: { contactId: contact.id } });
  if (!partner || partner.status !== "APPROVED") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid notification email is required" }, { status: 400 });
  }

  await prisma.wholesalePartner.update({
    where: { id: partner.id },
    data: { notificationEmail: parsed.data.notificationEmail, businessName: parsed.data.businessName || null },
  });

  return NextResponse.json({ ok: true });
}
