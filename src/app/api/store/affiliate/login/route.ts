import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { verifyPassword, signAffiliateToken } from "@/lib/affiliate-auth";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/store/affiliate/login
// Only succeeds for status: APPROVED -- a PENDING affiliate gets a clear
// "still under review" error instead of a generic invalid-credentials
// message (see AFFILIATE-PORTAL.md).
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const affiliate = await prisma.affiliate.findFirst({ where: { organizationId: store.organizationId, email } });
  if (!affiliate?.passwordHash || !(await verifyPassword(parsed.data.password, affiliate.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (affiliate.status === "PENDING") {
    return NextResponse.json({ error: "Your application is still under review — we'll email you once it's approved." }, { status: 403 });
  }
  if (affiliate.status === "REJECTED") {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = signAffiliateToken({ affiliateId: affiliate.id, organizationId: store.organizationId });

  return NextResponse.json({
    token,
    email: affiliate.email,
    name: affiliate.name,
    affiliate_id: affiliate.id,
    referralCode: affiliate.slug,
  });
}
