import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { resolveContactFromToken } from "@/lib/store-customer";
import { generateAffiliateCode } from "@/lib/affiliate-auth";

const bodySchema = z.object({
  token: z.string().optional(),
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
// Applies for affiliate status on the shopper's EXISTING account (resolved
// from `token`, the same bearer token /api/store/auth/login issues) --
// affiliates are a role on the Contact record, not a separate login. See
// AFFILIATE-PORTAL.md. Creates an Affiliate row with status: PENDING; a
// staff member approves/rejects from the CRM.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const contact = await resolveContactFromToken(req, store, raw);
  if (!contact) {
    return NextResponse.json({ error: "Sign in to your account first, then apply." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.affiliate.findUnique({ where: { contactId: contact.id } });
  if (existing) {
    return NextResponse.json({ error: "You've already applied to the affiliate program" }, { status: 409 });
  }

  const firstName = (contact.name ?? contact.email).split(" ")[0];
  const code = await generateAffiliateCode(
    firstName,
    async (candidate) => Boolean(await prisma.affiliate.findFirst({ where: { organizationId: store.organizationId, slug: candidate } }))
  );

  await prisma.affiliate.create({
    data: {
      organizationId: store.organizationId,
      contactId: contact.id,
      name: contact.name || contact.email,
      email: contact.email,
      slug: code,
      couponCode: code,
      ratePercent: 15,
      status: "PENDING",
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
