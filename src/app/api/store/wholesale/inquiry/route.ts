import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";

const bodySchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  website: z.string().optional(),
  monthlyVolume: z.string().optional(),
  message: z.string().optional(),
});

// POST /api/store/wholesale/inquiry — a B2B lead form, not self-serve
// signup. Doesn't require an existing Contact (a prospect may never have
// shopped on EVLV). Lands as a WholesaleInquiry for staff to review by
// hand; see /wholesale in the CRM.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.wholesaleInquiry.create({
    data: {
      organizationId: store.organizationId,
      companyName: parsed.data.companyName,
      contactName: parsed.data.contactName,
      email: parsed.data.email.toLowerCase().trim(),
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      monthlyVolume: parsed.data.monthlyVolume || null,
      message: parsed.data.message || null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
