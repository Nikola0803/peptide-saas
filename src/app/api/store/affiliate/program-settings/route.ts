import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { resolveContactFromToken } from "@/lib/store-customer";
import { AFFILIATE_CODE_RE, normalizeAffiliateCode } from "@/lib/affiliate-program";

const bodySchema = z.object({
  token: z.string().optional(),
  couponCode: z.string().min(4).max(24),
  customerDiscountPercent: z.number().int().min(0).max(30),
});

export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const contact = await resolveContactFromToken(req, store, raw);
  if (!contact) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const affiliate = await prisma.affiliate.findUnique({ where: { contactId: contact.id } });
  if (!affiliate || affiliate.organizationId !== store.organizationId || affiliate.status !== "APPROVED") {
    return NextResponse.json({ error: "Partner access is not active" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid code and whole-number discount." }, { status: 400 });

  const couponCode = normalizeAffiliateCode(parsed.data.couponCode);
  if (!AFFILIATE_CODE_RE.test(couponCode)) {
    return NextResponse.json({ error: "Code must be 4-24 characters using letters, numbers, hyphens, or underscores." }, { status: 400 });
  }
  if (parsed.data.customerDiscountPercent > Math.floor(affiliate.ratePercent)) {
    return NextResponse.json({ error: `Customer discount cannot exceed your ${affiliate.ratePercent}% partner rate.` }, { status: 400 });
  }

  const [affiliateCollision, couponCollision] = await Promise.all([
    prisma.affiliate.findFirst({
      where: { organizationId: store.organizationId, couponCode, id: { not: affiliate.id } },
      select: { id: true },
    }),
    prisma.coupon.findFirst({ where: { organizationId: store.organizationId, code: couponCode }, select: { id: true } }),
  ]);
  if (affiliateCollision || couponCollision) return NextResponse.json({ error: "That public code is already in use." }, { status: 409 });

  const updated = await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: { couponCode, customerDiscountPercent: parsed.data.customerDiscountPercent },
    select: { couponCode: true, customerDiscountPercent: true, ratePercent: true },
  });
  return NextResponse.json({
    ...updated,
    effectiveCommissionPercent: Math.max(0, updated.ratePercent - updated.customerDiscountPercent),
  });
}
