"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeMember, resendMemberCredentials, updateMemberRole } from "../settings/actions";

type StaffRole = "OWNER" | "ADMIN" | "MEMBER" | "CARE_AGENT" | "VETERINARY_PROFESSIONAL";

export function UserControls({ membershipId, email, role, actorRole }: { membershipId: string; email: string; role: StaffRole; actorRole: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ownerLocked = role === "OWNER" && actorRole !== "OWNER";

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          disabled={busy || ownerLocked}
          onChange={(event) => run(() => updateMemberRole(membershipId, event.target.value as StaffRole), "Role updated")}
          className="rounded border border-background-300 bg-background-50 px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <option value="MEMBER">Member</option>
          <option value="CARE_AGENT">Care Agent</option>
          <option value="VETERINARY_PROFESSIONAL">Veterinary Professional</option>
          <option value="ADMIN">Admin</option>
          {actorRole === "OWNER" ? <option value="OWNER">Owner</option> : null}
        </select>
        <button
          type="button"
          disabled={busy || ownerLocked}
          onClick={() => run(async () => {
            const result = await resendMemberCredentials(membershipId);
            if (!result.delivered) throw new Error("Email provider did not confirm delivery");
          }, "Temporary password emailed")}
          className="rounded border border-background-300 px-2.5 py-1.5 text-xs text-foreground-700 hover:bg-background-100 disabled:opacity-50"
        >
          Resend password
        </button>
        <button
          type="button"
          disabled={busy || ownerLocked}
          onClick={() => {
            if (window.confirm(`Remove CRM access for ${email}?`)) run(() => removeMember(membershipId), "Access removed");
          }}
          className="rounded px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      {message ? <p className="text-[11px] text-foreground-500">{message}</p> : null}
    </div>
  );
}
