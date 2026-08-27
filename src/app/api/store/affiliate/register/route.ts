import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { hashPassword, generateAffiliateCode } from "@/lib/affiliate-auth";

const bodySchema = z.object({
  username: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8),
  referredBy: z.string().optional(),
  socialLink: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
});

// POST /api/store/affiliate/register
// Creates an Affiliate row with status: PENDING -- does NOT log the
// applicant in (see AffiliateForm.tsx, which only checks res.ok and
// shows a static "application received, reviewed within a couple of
// business days" message). A staff member approves/rejects from the CRM.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await prisma.affiliate.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An affiliate account with this email already exists" }, { status: 409 });
  }

  const code = await generateAffiliateCode(
    parsed.data.firstName,
    async (candidate) => Boolean(await prisma.affiliate.findFirst({ where: { organizationId: store.organizationId, slug: candidate } }))
  );

  const passwordHash = await hashPassword(parsed.data.password);
  const name = [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ");

  await prisma.affiliate.create({
    data: {
      organizationId: store.organizationId,
      name,
      slug: code,
      couponCode: code,
      ratePercent: 15,
      status: "PENDING",
      email,
      passwordHash,
      username: parsed.data.username || null,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      phone: parsed.data.phone || null,
      socialLink: parsed.data.socialLink || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      province: parsed.data.province || null,
      postalCode: parsed.data.postalCode || null,
      country: parsed.data.country || null,
      referredBy: parsed.data.referredBy || null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
