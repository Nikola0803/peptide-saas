import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { verifyPassword, signCustomerToken } from "@/lib/customer-auth";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/store/auth/login
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

  const contact = await prisma.contact.findUnique({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
  });
  if (!contact?.passwordHash || !(await verifyPassword(parsed.data.password, contact.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

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

  return NextResponse.json({ token, customer: { email, name: contact.name } });
}
