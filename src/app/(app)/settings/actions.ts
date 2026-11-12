"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { createId } from "@/lib/id";
import { requireAdmin, requireOrg } from "@/lib/session";
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

export async function inviteMember(formData: FormData): Promise<{ email: string; password: string; delivered: boolean }> {
  const { organization, session } = await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "MEMBER") as "OWNER" | "ADMIN" | "MEMBER" | "CARE_AGENT" | "VETERINARY_PROFESSIONAL";
  const rawBrandIds = formData.getAll("brandIds[]").map(String).filter(Boolean);
  if (!email) throw new Error("Email is required");
  if (!["OWNER", "ADMIN", "MEMBER", "CARE_AGENT", "VETERINARY_PROFESSIONAL"].includes(role)) throw new Error("Invalid role");
  if (role === "OWNER" && (session.user as any)?.role !== "OWNER") throw new Error("Only an owner can add another owner");
  // Non-OWNER members must be assigned at least one site.
  if (role !== "OWNER" && rawBrandIds.length === 0) throw new Error("Select at least one site for this user");

  // Verify all supplied brandIds belong to this org.
  const validBrands = rawBrandIds.length > 0
    ? await prisma.brand.findMany({ where: { id: { in: rawBrandIds }, organizationId: organization.id }, select: { id: true } })
    : [];
  const brandIds = validBrands.map((b) => b.id);

  const password = createId().slice(0, 16);
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: name || null, passwordHash },
  });

  const existingMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
  });
  if (existingMembership) throw new Error("That person is already a member of this organization");

  const membership = await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role },
  });

  if (role !== "OWNER" && brandIds.length > 0) {
    await prisma.membershipBrandAccess.createMany({
      data: brandIds.map((brandId) => ({ membershipId: membership.id, brandId })),
    });
  }

  const delivered = await sendEmail(
    email,
    `You've been added to ${organization.name}`,
    `<p>You now have ${role.toLowerCase()} access to the ${organization.name} Command Center.</p><p>Sign in with:</p><p>Email: ${email}<br/>Temporary password: <strong>${password}</strong></p>`
  ).catch(() => false);
  if (delivered) await prisma.user.update({ where: { id: user.id }, data: { credentialInviteSentAt: new Date() } });

  revalidatePath("/settings");
  revalidatePath("/users");
  return { email, password, delivered };
}

export async function updateMemberRole(membershipId: string, role: "OWNER" | "ADMIN" | "MEMBER" | "CARE_AGENT" | "VETERINARY_PROFESSIONAL") {
  const { organization, session } = await requireAdmin();
  const actorId = (session.user as any)?.id as string;
  const actorRole = (session.user as any)?.role as string;
  const membership = await prisma.membership.findFirst({ where: { id: membershipId, organizationId: organization.id } });
  if (!membership || membership.role === "DROPSHIP_AGENT") throw new Error("User not found");
  if (membership.userId === actorId) throw new Error("You cannot change your own role");
  if ((membership.role === "OWNER" || role === "OWNER") && actorRole !== "OWNER") throw new Error("Only an owner can manage owners");
  if (membership.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.membership.count({ where: { organizationId: organization.id, role: "OWNER" } });
    if (ownerCount <= 1) throw new Error("You cannot demote the last owner");
  }
  await prisma.membership.update({ where: { id: membership.id }, data: { role } });
  revalidatePath("/settings");
  revalidatePath("/users");
}

// Replace a membership's brand-access set. Pass an empty array to remove
// all restrictions (unrestricted again). OWNER memberships are skipped
// since they always bypass brand access checks.
export async function updateMemberBrandAccess(membershipId: string, brandIds: string[]) {
  const { organization } = await requireAdmin();
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: organization.id },
  });
  if (!membership || membership.role === "DROPSHIP_AGENT") throw new Error("User not found");
  if (membership.role === "OWNER") return; // owners always see all

  // Validate supplied brand ids belong to this org.
  const valid = brandIds.length > 0
    ? await prisma.brand.findMany({ where: { id: { in: brandIds }, organizationId: organization.id }, select: { id: true } })
    : [];
  const validIds = valid.map((b) => b.id);

  await prisma.$transaction([
    prisma.membershipBrandAccess.deleteMany({ where: { membershipId } }),
    ...(validIds.length > 0
      ? [prisma.membershipBrandAccess.createMany({ data: validIds.map((brandId) => ({ membershipId, brandId })) })]
      : []),
  ]);
  revalidatePath("/users");
}

export async function removeMember(membershipId: string) {
  const { organization, session } = await requireAdmin();
  const actorId = (session.user as any)?.id as string;
  const actorRole = (session.user as any)?.role as string;

  const membership = await prisma.membership.findFirst({ where: { id: membershipId, organizationId: organization.id } });
  if (!membership || membership.role === "DROPSHIP_AGENT") throw new Error("Not found");
  if (membership.userId === actorId) throw new Error("You cannot remove your own account");
  if (membership.role === "OWNER" && actorRole !== "OWNER") throw new Error("Only an owner can remove another owner");

  if (membership.role === "OWNER") {
    const ownerCount = await prisma.membership.count({ where: { organizationId: organization.id, role: "OWNER" } });
    if (ownerCount <= 1) throw new Error("Can't remove the last owner");
  }

  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/settings");
  revalidatePath("/users");
}

export async function resendMemberCredentials(membershipId: string): Promise<{ delivered: boolean }> {
  const { organization, session } = await requireAdmin();
  const actorRole = (session.user as any)?.role as string;
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: organization.id, role: { not: "DROPSHIP_AGENT" } },
    include: { user: true },
  });
  if (!membership) throw new Error("User not found");
  if (membership.role === "OWNER" && actorRole !== "OWNER") throw new Error("Only an owner can reset an owner's credentials");

  const password = createId().slice(0, 8) + createId().slice(-8).toUpperCase();
  const delivered = await sendEmail(
    membership.user.email,
    `Your ${organization.name} CRM temporary password`,
    `<h1>${organization.name} CRM access</h1><p>Your temporary administrator password has been reset.</p><p><strong>Login:</strong> <a href="https://crm.evlvpeptides.com/login">https://crm.evlvpeptides.com/login</a></p><p><strong>Email:</strong> ${membership.user.email}<br/><strong>Temporary password:</strong> ${password}</p>`,
  ).catch(() => false);
  if (!delivered) return { delivered: false };

  await prisma.user.update({
    where: { id: membership.userId },
    data: { passwordHash: await bcrypt.hash(password, 12), credentialInviteSentAt: new Date() },
  });
  revalidatePath("/users");
  return { delivered: true };
}
