import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { hashPassword, signCustomerToken } from "@/lib/customer-auth";
import { sendTemplate } from "@/lib/email";
import { ensureJoin25Coupon, ensureWelcomeCoupon, JOIN25_PERCENT } from "@/lib/welcome-coupon";
import { attachReferralAtRegistration, ensureReferralCode } from "@/lib/customer-referral";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(2).max(160),
  dateOfBirth: z.coerce.date().refine((value) => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 21);
    return value <= cutoff;
  }, "You must be at least 21 years old to register."),
  company: z.string().trim().max(160).optional(),
  businessType: z.enum(["RESEARCHER", "CLINIC", "UNIVERSITY", "DISTRIBUTOR", "OTHER"]),
  phone: z.string().trim().min(7).max(40),
  ruoAttested: z.literal(true),
  marketingOptIn: z.boolean().optional(),
  referralCode: z.string().trim().max(80).optional(),
  offer: z.enum(["JOIN25"]).optional(),
});

// POST /api/store/auth/register
// Called by evlv-site's server-only proxy at src/lib/crm-proxy.ts. Requires
// the x-store-domain / x-store-api-key header pair — see store-context.ts.
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

  const existing = await prisma.contact.findUnique({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
  });
  if (existing?.passwordHash) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const marketingOptIn = parsed.data.marketingOptIn ?? false;
  const profile = {
    name: parsed.data.name,
    dateOfBirth: parsed.data.dateOfBirth,
    company: parsed.data.company || null,
    businessType: parsed.data.businessType,
    phone: parsed.data.phone,
    ruoAttestedAt: new Date(),
  };
  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
    update: { passwordHash, marketingOptIn, ...profile },
    create: { organizationId: store.organizationId, email, passwordHash, marketingOptIn, ...profile },
  });
  await prisma.contactBrandLink.upsert({
    where: { contactId_brandId: { contactId: contact.id, brandId: store.brandId } },
    update: {},
    create: { contactId: contact.id, brandId: store.brandId },
  });

  await attachReferralAtRegistration({
    organizationId: store.organizationId,
    brandId: store.brandId,
    friendContactId: contact.id,
    referralCode: parsed.data.referralCode,
  });
  const referralCode = await ensureReferralCode(contact.id);

  const isJoin25 = parsed.data.offer === "JOIN25";
  const couponCode = isJoin25
    ? await ensureJoin25Coupon(store.organizationId, contact.id, email)
    : await ensureWelcomeCoupon(store.organizationId, contact.id, email);
  const welcomeDiscountPercent = isJoin25
    ? JOIN25_PERCENT
    : couponCode.toUpperCase().startsWith("WELCOME20-") ? 20 : 10;

  sendTemplate(store.organizationId, "welcome_customer", email, {
    customerName: contact.name || email,
    couponCode,
    welcomeDiscountPercent: String(welcomeDiscountPercent),
    referralLink: `https://www.evlvpeptides.com/?ref=${encodeURIComponent(referralCode)}`,
  }, { brandId: store.brandId }).catch((err) => console.error("Welcome email failed", err));

  const token = signCustomerToken({
    contactId: contact.id,
    organizationId: store.organizationId,
    brandId: store.brandId,
    email,
  });

  // Flat shape, not nested under `customer` — evlv-site's saveAuth() reads
  // token/email/username/user_id directly off the top-level response and
  // writes them straight to localStorage as-is (src/lib/auth.ts), so
  // anything nested here is silently lost on their end.
  return NextResponse.json(
    { token, email, username: contact.name || email, user_id: contact.id, couponCode, welcomeDiscountPercent, referralCode },
    { status: 201 }
  );
}
