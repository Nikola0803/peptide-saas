import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyCustomerToken } from "@/lib/customer-auth";

// POST /api/auth/validate — alias for /api/store/auth/validate.
// evlv-site's own /api/auth/validate proxy route calls this exact path
// (crm-proxy.ts always POSTs, and this one route diverges from register/
// login/checkout/account-orders which all hit /api/store/...), so this
// exists to match what's actually deployed rather than what the naming
// convention would otherwise suggest. Keep in sync with
// ../../store/auth/validate/route.ts if either changes.
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

  return NextResponse.json({ valid: true, email: contact.email, username: contact.name || contact.email, user_id: contact.id });
}
