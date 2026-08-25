import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyCustomerToken } from "@/lib/customer-auth";

// POST /api/store/auth/validate
// Lets evlv-site check whether a stored token is still good (e.g. on app
// load) without re-sending credentials.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const token = bearerToken(req) ?? (await req.json().catch(() => ({})))?.token;
  const claims = verifyCustomerToken(token);
  if (!claims || claims.organizationId !== store.organizationId || claims.brandId !== store.brandId) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const contact = await prisma.contact.findUnique({ where: { id: claims.contactId } });
  if (!contact) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  return NextResponse.json({ valid: true, customer: { email: contact.email, name: contact.name } });
}
