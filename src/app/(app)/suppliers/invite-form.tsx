"use client";

import { useState } from "react";
import { inviteSupplierLogin } from "./actions";

export function InviteForm({ supplierId, existingEmail }: { supplierId: string; existingEmail?: string }) {
  const [email, setEmail] = useState(existingEmail ?? "");
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (result) {
    return (
      <div className="text-xs bg-primary-50 border border-primary-200 rounded p-2.5 mt-2">
        <p className="font-medium text-foreground-900 mb-1">
          {existingEmail ? "Password reset — copy this now, it won't be shown again:" : "Login created — copy this now, it won't be shown again:"}
        </p>
        <p className="font-mono">{result.email}</p>
        <p className="font-mono">{result.password}</p>
      </div>
    );
  }

  // Submitting the SAME email a supplier already logs in with resets their
  // password (inviteSupplierLogin upserts by email) -- there's no separate
  // "view password" anywhere, since only the bcrypt hash is ever stored.
  // Pre-filling with their current login email makes that the obvious path
  // instead of something you have to already know.
  return (
    <form
      className="flex items-center gap-1.5 mt-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
          const formData = new FormData();
          formData.set("email", email);
          const res = await inviteSupplierLogin(supplierId, formData);
          setResult(res);
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
        placeholder="partner@example.com"
        className="flex-1 text-xs border border-background-300 rounded px-2 py-1 bg-background-50"
      />
      <button
        disabled={loading}
        className="text-xs bg-primary-500 text-background-50 rounded px-2 py-1 font-medium hover:bg-primary-600 disabled:opacity-60"
      >
        {loading ? "…" : existingEmail ? "Reset password" : "Invite"}
      </button>
      {error && <span className="text-xs text-accent-700">{error}</span>}
    </form>
  );
}
