import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { signCustomerToken } from "@/lib/customer-auth";

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(160).optional(),
});

// POST /api/store/auth/google
// The storefront verifies the Google OpenID token server-side before it calls
// this trusted, store-key-protected route. This endpoint only creates or links
// the normal EVLV customer identity and returns the same session shape used by
// email/password sign-in.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Google account details" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
    // Do not overwrite an existing customer-set name with a provider name.
    update: {},
    create: {
      organizationId: store.organizationId,
      email,
      name: parsed.data.name,
    },
  });

  await prisma.contactBrandLink.upsert({
    where: { contactId_brandId: { contactId: contact.id, brandId: store.brandId } },
    update: {},
    create: { contactId: contact.id, brandId: store.brandId },
  });

  const token = signCustomerToken({
    contactId: contact.id,
    organizationId: store.organizationId,
    brandId: store.brandId,
    email,
  });

  return NextResponse.json({ token, email, username: contact.name || parsed.data.name || email, user_id: contact.id });
}
