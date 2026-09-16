import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customer-auth";

export const runtime = "nodejs";

// POST /api/store/account/delete-request-status { token } -- always 200s:
// a customer who never asked is a legitimate "NONE" state. Mirrors
// /api/store/verification/status.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const claims = verifyCustomerToken(typeof body?.token === "string" ? body.token : null);
  if (!claims) {
    return NextResponse.json({ status: "NONE" });
  }

  const request = await prisma.accountDeletionRequest.findUnique({ where: { contactId: claims.contactId } });
  return NextResponse.json({ status: request?.status ?? "NONE" });
}
