"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeMember, resendMemberCredentials, updateMemberRole, updateMemberBrandAccess } from "../settings/actions";

type StaffRole = "OWNER" | "ADMIN" | "MEMBER" | "CARE_AGENT" | "VETERINARY_PROFESSIONAL";
type Brand = { id: string; name: string; domain: string };

export function UserControls({
  membershipId,
  email,
  role,
  actorRole,
  allBrands,
  currentBrandIds,
  isOwner,
}: {
  membershipId: string;
  email: string;
  role: StaffRole;
  actorRole: string;
  allBrands: Brand[];
  currentBrandIds: string[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [brandIds, setBrandIds] = useState<string[]>(currentBrandIds);
  const [brandBusy, setBrandBusy] = useState(false);
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

  function toggleBrand(id: string) {
    setBrandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function saveBrandAccess() {
    setBrandBusy(true);
    setMessage("");
    try {
      await updateMemberBrandAccess(membershipId, brandIds);
      setMessage("Site access saved");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBrandBusy(false);
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
      {!isOwner && (
        <div className="flex flex-col items-end gap-1.5 w-full sm:w-auto">
          <p className="text-[10px] text-foreground-500 self-start sm:self-auto">Site access:</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {allBrands.map((b) => {
              const checked = brandIds.includes(b.id);
              return (
                <label
                  key={b.id}
                  className={`flex items-center gap-1 cursor-pointer rounded border px-2 py-0.5 text-[10px] transition-colors ${
                    checked
                      ? "border-primary-400 bg-primary-50 text-primary-800"
                      : "border-background-300 bg-background-50 text-foreground-500 hover:border-background-400"
                  }`}
                >
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleBrand(b.id)} />
                  {b.name}
                </label>
              );
            })}
            <button
              type="button"
              disabled={brandBusy}
              onClick={saveBrandAccess}
              className="rounded border border-primary-300 bg-primary-50 px-2 py-0.5 text-[10px] text-primary-700 hover:bg-primary-100 disabled:opacity-50"
            >
              {brandBusy ? "…" : "Save"}
            </button>
          </div>
        </div>
      )}
      {message ? <p className="text-[11px] text-foreground-500">{message}</p> : null}
    </div>
  );
}
