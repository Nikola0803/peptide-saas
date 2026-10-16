import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";

// GET /api/store/referral/validate?code=XXXXXXXXXX
// Used by the storefront to confirm a referral code is real before showing
// the "$15 off when you sign up" banner. Returns the referrer's first name
// so the UI can show "Jane shared this link with you".
export async function GET(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const referrer = await prisma.contact.findFirst({
    where: { organizationId: store.organizationId, referralCode: code },
    select: { name: true },
  });

  if (!referrer) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }

  const firstName = referrer.name?.split(" ")[0] || null;
  return NextResponse.json({ valid: true, referrerName: firstName, discountCents: 1500 });
}
