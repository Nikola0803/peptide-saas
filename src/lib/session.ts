import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminIpAllowed } from "@/lib/geo";
import { DROPSHIP_ENABLED } from "@/lib/features";

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
  const userId = (session?.user as any)?.id as string | undefined;
  const totpEnabled = (session?.user as any)?.totpEnabled as boolean | undefined;

  if (!session || !organizationId) {
    redirect("/login");
  }

  // Suppliers have their own restricted area.
  if (role === "DROPSHIP_AGENT") {
    redirect(DROPSHIP_ENABLED ? "/dropship" : "/blocked");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    redirect("/login");
  }

  // 2FA enforcement: until 2FA is set up, send the user to the security
  // page. That page lives in the (setup) route group, outside the (app)
  // layout that calls this, so it can never redirect to itself.
  if (!totpEnabled) {
    redirect("/settings/security?setup=required");
  }

  // Brand-scoped access: OWNER always sees all. Other roles see only the
  // brands explicitly granted via MembershipBrandAccess, or all brands if
  // no rows exist for their membership (backwards-compatible default for
  // existing admins who predate this feature).
  let allowedBrandIds: string[] | null = null;
  if (role !== "OWNER" && userId) {
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { brandAccess: { select: { brandId: true } } },
    });
    if (membership && membership.brandAccess.length > 0) {
      allowedBrandIds = membership.brandAccess.map((a) => a.brandId);
    }
  }

  return { session, organization: organization!, allowedBrandIds };
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
    redirect(DROPSHIP_ENABLED ? "/dropship" : "/blocked");
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
  if (!DROPSHIP_ENABLED) redirect("/blocked");

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
