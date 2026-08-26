import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { hashPassword, signCustomerToken } from "@/lib/customer-auth";
import { sendTemplate } from "@/lib/email";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  marketingOptIn: z.boolean().optional(),
});

// POST /api/store/auth/register
// Called by evlv-site's server-only proxy at src/lib/crm-proxy.ts. Requires
// the x-store-domain / x-store-api-key header pair — see store-context.ts.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await prisma.contact.findUnique({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
  });
  if (existing?.passwordHash) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const marketingOptIn = parsed.data.marketingOptIn ?? false;
  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
    update: { passwordHash, name: parsed.data.name, marketingOptIn },
    create: { organizationId: store.organizationId, email, passwordHash, name: parsed.data.name, marketingOptIn },
  });
  await prisma.contactBrandLink.upsert({
    where: { contactId_brandId: { contactId: contact.id, brandId: store.brandId } },
    update: {},
    create: { contactId: contact.id, brandId: store.brandId },
  });

  sendTemplate(store.organizationId, "welcome_customer", email, { customerName: contact.name || email }).catch((err) =>
    console.error("Welcome email failed", err)
  );

  const token = signCustomerToken({
    contactId: contact.id,
    organizationId: store.organizationId,
    brandId: store.brandId,
    email,
  });

  // Flat shape, not nested under `customer` — evlv-site's saveAuth() reads
  // token/email/username/user_id directly off the top-level response and
  // writes them straight to localStorage as-is (src/lib/auth.ts), so
  // anything nested here is silently lost on their end.
  return NextResponse.json(
    { token, email, username: contact.name || email, user_id: contact.id },
    { status: 201 }
  );
}
