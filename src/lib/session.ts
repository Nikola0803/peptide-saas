import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Every dashboard page calls this first. Centralizing it here means the
// day multi-org switching or invitations land, only this file changes.
export async function requireOrg() {
  const session = await getServerSession(authOptions);
  const organizationId = (session?.user as any)?.organizationId as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;

  if (!session || !organizationId) {
    redirect("/login");
  }

  // A supplier's login has no business in the main dashboard -- send them
  // to their own restricted area instead of a 404/blank page.
  if (role === "DROPSHIP_AGENT") {
    redirect("/dropship");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    redirect("/login");
  }

  return { session, organization: organization! };
}

// Every /dropship page calls this first, mirroring requireOrg(). Always
// re-resolves the Membership from the DB rather than trusting the JWT's
// supplierId for the actual data fetch -- the JWT is only used to route
// the initial redirect after login (see login/page.tsx) and for the top
// role check below, cheap to get wrong; which supplier's data a page
// queries is not.
export async function requireSupplier() {
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
