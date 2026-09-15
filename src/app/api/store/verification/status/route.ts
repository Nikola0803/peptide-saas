import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customer-auth";

export const runtime = "nodejs";

// POST /api/store/verification/status { token } -- see RESEARCHER-VERIFICATION.md.
// Always 200s: a customer who never applied is a legitimate "NONE" state.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const claims = verifyCustomerToken(typeof body?.token === "string" ? body.token : null);
  if (!claims) {
    return NextResponse.json({ status: "NONE" });
  }

  const verification = await prisma.customerVerification.findUnique({ where: { contactId: claims.contactId } });
  return NextResponse.json({ status: verification?.status ?? "NONE" });
}
