"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateMemberRole } from "./actions";

export function RoleSelect({ membershipId, currentRole }: { membershipId: string; currentRole: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  return (
    <select
      defaultValue={currentRole}
      disabled={saving}
      onChange={async (e) => {
        setSaving(true);
        await updateMemberRole(membershipId, e.target.value as "OWNER" | "ADMIN" | "MEMBER");
        router.refresh();
        setSaving(false);
      }}
      className="text-xs border border-background-300 rounded px-1.5 py-1 bg-background-50 disabled:opacity-60"
    >
      <option value="MEMBER">Member</option>
      <option value="ADMIN">Admin</option>
      <option value="OWNER">Owner</option>
    </select>
  );
}
