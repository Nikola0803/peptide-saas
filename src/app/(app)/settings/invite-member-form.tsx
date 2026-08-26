"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteMember } from "./actions";

export function InviteMemberForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (result) {
    return (
      <div className="text-xs bg-primary-50 border border-primary-200 rounded p-2.5">
        <p className="font-medium text-foreground-900 mb-1">Added — copy this now, it won't be shown again:</p>
        <p className="font-mono">{result.email}</p>
        <p className="font-mono">{result.password}</p>
        <button
          onClick={() => {
            setResult(null);
            setEmail("");
          }}
          className="mt-2 text-xs text-primary-600 hover:underline"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
          const formData = new FormData();
          formData.set("email", email);
          formData.set("role", role);
          const res = await inviteMember(formData);
          setResult(res);
          router.refresh();
        } catch (err: any) {
          setError(err?.message ?? "Something went wrong");
        } finally {
          setLoading(false);
        }
      }}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="teammate@company.com"
        className="flex-1 text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} className="text-sm border border-background-300 rounded px-2 py-1.5 bg-background-50">
        <option value="MEMBER">Member</option>
        <option value="ADMIN">Admin</option>
        <option value="OWNER">Owner</option>
      </select>
      <button disabled={loading} className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 disabled:opacity-60">
        {loading ? "…" : "Add"}
      </button>
      {error && <span className="text-xs text-accent-700">{error}</span>}
    </form>
  );
}
