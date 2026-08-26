"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { createId } from "@/lib/id";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export async function regenerateApiKey() {
  const { organization } = await requireOrg();

  await prisma.organization.update({
    where: { id: organization.id },
    data: { apiKey: createId() },
  });

  revalidatePath("/settings");
  revalidatePath("/webhooks");
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function updateBrandProfile(formData: FormData) {
  const { organization } = await requireOrg();
  const brandId = str(formData, "brandId");
  if (!brandId) return;

  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: organization.id } });
  if (!brand) return;

  await prisma.brand.update({
    where: { id: brandId },
    data: {
      logoUrl: str(formData, "logoUrl"),
      supportEmail: str(formData, "supportEmail"),
      senderName: str(formData, "senderName"),
      emailAccentColor: str(formData, "emailAccentColor"),
      businessAddress: str(formData, "businessAddress"),
    },
  });

  revalidatePath("/settings");
}

// Staff team management -- OWNER/ADMIN/MEMBER only. Never touches
// DROPSHIP_AGENT memberships, those are managed from /suppliers against a
// specific Supplier, not general team members.

export async function inviteMember(formData: FormData): Promise<{ email: string; password: string }> {
  const { organization } = await requireOrg();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "MEMBER") as "OWNER" | "ADMIN" | "MEMBER";
  if (!email) throw new Error("Email is required");
  if (!["OWNER", "ADMIN", "MEMBER"].includes(role)) throw new Error("Invalid role");

  const password = createId().slice(0, 16);
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash },
  });

  const existingMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
  });
  if (existingMembership) throw new Error("That person is already a member of this organization");

  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role },
  });

  sendEmail(
    email,
    `You've been added to ${organization.name}`,
    `<p>You now have ${role.toLowerCase()} access to the ${organization.name} Command Center.</p><p>Sign in with:</p><p>Email: ${email}<br/>Temporary password: <strong>${password}</strong></p>`
  ).catch(() => {});

  revalidatePath("/settings");
  return { email, password };
}

export async function updateMemberRole(membershipId: string, role: "OWNER" | "ADMIN" | "MEMBER") {
  const { organization } = await requireOrg();
  await prisma.membership.updateMany({
    where: { id: membershipId, organizationId: organization.id, role: { not: "DROPSHIP_AGENT" } },
    data: { role },
  });
  revalidatePath("/settings");
}

export async function removeMember(membershipId: string) {
  const { organization } = await requireOrg();

  const membership = await prisma.membership.findFirst({ where: { id: membershipId, organizationId: organization.id } });
  if (!membership || membership.role === "DROPSHIP_AGENT") throw new Error("Not found");

  if (membership.role === "OWNER") {
    const ownerCount = await prisma.membership.count({ where: { organizationId: organization.id, role: "OWNER" } });
    if (ownerCount <= 1) throw new Error("Can't remove the last owner");
  }

  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/settings");
}
