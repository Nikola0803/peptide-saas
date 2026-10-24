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
  const users = await prisma.membership.findMany({
    where: { organizationId: organization.id, role: { in: [...STAFF_ROLES] } },
    include: { user: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div>
      <PageHeader title="Users" subtitle="Add staff, manage access levels, resend credentials, or remove access" />
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground-950">Add CRM user</h2>
          <p className="mb-4 text-xs text-foreground-500">A temporary password is generated and emailed automatically. Only owners can create another owner.</p>
          <InviteMemberForm />
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-background-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground-950">Active users ({users.length})</h2>
          </div>
          <div className="divide-y divide-background-200">
            {users.map((membership) => (
              <div key={membership.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground-950">{membership.user.name || membership.user.email}</p>
                    {membership.userId === currentUserId ? <span className="text-[10px] uppercase tracking-wide text-primary-600">You</span> : null}
                  </div>
                  <p className="truncate text-xs text-foreground-500">{membership.user.email}</p>
                  <p className="mt-1 text-[11px] text-foreground-400">
                    Added {membership.createdAt.toLocaleDateString()} · Credentials {membership.user.credentialInviteSentAt ? `sent ${membership.user.credentialInviteSentAt.toLocaleDateString()}` : "not confirmed sent"}
                  </p>
                </div>
                {membership.userId === currentUserId ? (
                  <Badge status={membership.role} />
                ) : (
                  <UserControls membershipId={membership.id} email={membership.user.email} role={membership.role as typeof STAFF_ROLES[number]} actorRole={currentRole} />
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
