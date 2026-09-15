import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customer-auth";

export const runtime = "nodejs";

// POST /api/store/membership/status { token } -- resolves the Contact from
// the token and returns their real Membership status. Always 200s: a
// customer who never applied is a legitimate "NONE" state, not an error.
// Mirrors /api/store/verification/status exactly (see MEMBERSHIP.md).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const claims = verifyCustomerToken(typeof body?.token === "string" ? body.token : null);
  if (!claims) {
    return NextResponse.json({ status: "NONE" });
  }

  const request = await prisma.membershipRequest.findUnique({ where: { contactId: claims.contactId } });
  return NextResponse.json({ status: request?.status ?? "NONE" });
}
