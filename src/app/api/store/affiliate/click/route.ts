import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";

const bodySchema = z.object({ code: z.string().min(1) });

// POST /api/store/affiliate/click { code } -- public, no auth beyond the
// usual store header pair, since it's just a counter. Silently no-ops if
// the code doesn't match any Affiliate.slug (most ?ref= codes will be
// customer referral codes from the separate referral program, not
// affiliate codes -- see REFERRAL-PROGRAM.md).
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: true }); // don't leak validation details to a fire-and-forget counter
  }

  const affiliate = await prisma.affiliate.findFirst({
    where: { organizationId: store.organizationId, slug: { equals: parsed.data.code, mode: "insensitive" } },
  });
  if (affiliate) {
    await prisma.affiliateClick.create({ data: { affiliateId: affiliate.id } });
  }

  return NextResponse.json({ ok: true });
}
