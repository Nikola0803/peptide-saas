import { PageHeader, Card, Badge } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { InviteMemberForm } from "../settings/invite-member-form";
import { UserControls } from "./user-controls";

const STAFF_ROLES = ["OWNER", "ADMIN", "MEMBER", "CARE_AGENT", "VETERINARY_PROFESSIONAL"] as const;

export default async function UsersPage() {
  const { organization, session } = await requireAdmin();
  const currentUserId = (session.user as any)?.id as string;
  const currentRole = (session.user as any)?.role as string;
  const [users, brands] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: organization.id, role: { in: [...STAFF_ROLES] } },
      include: { user: true, brandAccess: { include: { brand: { select: { id: true, name: true, domain: true } } } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.brand.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true, domain: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Users" subtitle="Add staff, manage access levels, resend credentials, or remove access" />
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground-950">Add CRM user</h2>
          <p className="mb-4 text-xs text-foreground-500">
            A temporary password is generated and emailed automatically. Owners see all sites — other roles require at least one site selected.
          </p>
          <InviteMemberForm brands={brands} />
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-background-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground-950">Active users ({users.length})</h2>
          </div>
          <div className="divide-y divide-background-200">
            {users.map((membership) => {
              const accessedBrands = membership.brandAccess.map((a) => a.brand);
              const isOwner = membership.role === "OWNER";
              return (
                <div key={membership.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground-950">{membership.user.name || membership.user.email}</p>
                      {membership.userId === currentUserId ? <span className="text-[10px] uppercase tracking-wide text-primary-600">You</span> : null}
                    </div>
                    <p className="truncate text-xs text-foreground-500">{membership.user.email}</p>
                    <p className="mt-1 text-[11px] text-foreground-400">
                      Added {membership.createdAt.toLocaleDateString()} · Credentials{" "}
                      {membership.user.credentialInviteSentAt
                        ? `sent ${membership.user.credentialInviteSentAt.toLocaleDateString()}`
                        : "not confirmed sent"}
                    </p>
                    {/* Site access badges */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {isOwner ? (
                        <span className="inline-flex items-center gap-1 rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-800">
                          All sites
                        </span>
                      ) : accessedBrands.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded bg-background-200 px-1.5 py-0.5 text-[10px] font-medium text-foreground-500">
                          All sites (unrestricted)
                        </span>
                      ) : (
                        accessedBrands.map((b) => (
                          <span
                            key={b.id}
                            className="inline-flex items-center gap-1 rounded bg-secondary-100 px-1.5 py-0.5 text-[10px] font-medium text-secondary-800"
                          >
                            {b.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  {membership.userId === currentUserId ? (
                    <Badge status={membership.role} />
                  ) : (
                    <UserControls
                      membershipId={membership.id}
                      email={membership.user.email}
                      role={membership.role as (typeof STAFF_ROLES)[number]}
                      actorRole={currentRole}
                      allBrands={brands}
                      currentBrandIds={accessedBrands.map((b) => b.id)}
                      isOwner={isOwner}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
