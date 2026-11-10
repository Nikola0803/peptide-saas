import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminIpAllowed } from "@/lib/geo";

// Every dashboard page calls this first. Centralizing it here means the
// day multi-org switching or invitations land, only this file changes.
export async function requireOrg() {
  // Geo-lock: admin dashboard is Serbia-only.
  if (!isAdminIpAllowed()) {
    redirect("/login?blocked=1");
  }

  const session = await getServerSession(authOptions);
  const organizationId = (session?.user as any)?.organizationId as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  const totpEnabled = (session?.user as any)?.totpEnabled as boolean | undefined;

  if (!session || !organizationId) {
    redirect("/login");
  }

  // Suppliers have their own restricted area.
  if (role === "DROPSHIP_AGENT") {
    redirect("/dropship");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    redirect("/login");
  }

  // 2FA enforcement: if 2FA is not yet set up, force the user to the
  // security settings page before they can access anything else.
  // (The security page itself calls requireSession() to avoid a loop.)
  if (!totpEnabled) {
    redirect("/settings/security?setup=required");
  }

  return { session, organization: organization! };
}

// Lighter gate used only by pages that must be accessible during 2FA setup
// (e.g. /settings/security). Still requires a valid session and geo check,
// but does NOT enforce 2FA enrollment.
export async function requireSession() {
  if (!isAdminIpAllowed()) {
    redirect("/login?blocked=1");
  }

  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;

  if (!session) {
    redirect("/login");
  }

  if (role === "DROPSHIP_AGENT") {
    redirect("/dropship");
  }

  return { session };
}

export async function requireAdmin() {
  const context = await requireOrg();
  const role = (context.session.user as any)?.role as string | undefined;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard");
  return context;
}

export async function requireSupplier() {
  if (!isAdminIpAllowed()) {
    redirect("/login?blocked=1");
  }

  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  const userId = (session?.user as any)?.id as string | undefined;

  if (!session || !userId || role !== "DROPSHIP_AGENT") {
    redirect("/login");
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, role: "DROPSHIP_AGENT" },
    include: { supplier: true, organization: true },
  });

  if (!membership?.supplier) {
    redirect("/login");
  }

  return { session, supplier: membership!.supplier!, organization: membership!.organization };
}
