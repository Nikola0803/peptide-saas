import { requireSupplier } from "@/lib/session";
import { PageHeader, Card } from "@/components/ui";
import { changePassword, updateContactEmail } from "./actions";

export default async function DropshipAccountPage() {
  const { supplier, session } = await requireSupplier();

  return (
    <div>
      <PageHeader title="Account" subtitle={(session.user as any)?.email} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Contact email</h2>
          <p className="text-xs text-foreground-500 mb-3">Where new-order and notification emails go.</p>
          <form action={updateContactEmail} className="space-y-2">
            <input
              name="contactEmail"
              type="email"
              required
              defaultValue={supplier.contactEmail ?? ""}
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
              Save
            </button>
          </form>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Change password</h2>
          <form action={changePassword} className="space-y-2">
            <input
              name="currentPassword"
              type="password"
              required
              placeholder="Current password"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              placeholder="New password (min 8 characters)"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
              Update password
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
