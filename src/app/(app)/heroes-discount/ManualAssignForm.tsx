"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { manualAssignHeroesDiscount } from "./actions";

export function ManualAssignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ couponCode: string; name: string; email: string } | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-background-100 border border-background-300 rounded-md px-3 py-1.5 font-medium text-foreground-700 hover:bg-background-200"
      >
        + Manual assign
      </button>
    );
  }

  if (result) {
    return (
      <div className="text-sm bg-primary-50 border border-primary-200 rounded-lg p-4">
        <p className="font-semibold text-foreground-900 mb-1">Discount assigned ✓</p>
        <p className="text-foreground-700">{result.name} — {result.email}</p>
        <p className="text-foreground-700">Code: <span className="font-mono font-semibold">{result.couponCode}</span> (25% lifetime — auto-applies at checkout)</p>
        <p className="text-xs text-foreground-500 mt-1">Approval email sent.</p>
        <button
          onClick={() => { setResult(null); setOpen(false); router.refresh(); }}
          className="mt-2 text-xs text-primary-600 hover:underline"
        >
          Done
        </button>
        {" · "}
        <button
          onClick={() => { setResult(null); }}
          className="mt-2 text-xs text-primary-600 hover:underline"
        >
          Assign another
        </button>
      </div>
    );
  }

  return (
    <form
      className="border border-background-200 rounded-lg p-4 bg-background-50 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
          const fd = new FormData(e.currentTarget);
          const res = await manualAssignHeroesDiscount(fd);
          setResult(res);
        } catch (err: any) {
          setError(err?.message ?? "Something went wrong");
        } finally {
          setLoading(false);
        }
      }}
    >
      <p className="text-xs font-semibold text-foreground-700 uppercase tracking-wide">Manual assign — 25% lifetime</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-foreground-600 mb-1">Full name *</label>
          <input
            name="name"
            required
            placeholder="William Smith"
            className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
          />
        </div>
        <div>
          <label className="block text-xs text-foreground-600 mb-1">Email *</label>
          <input
            name="email"
            type="email"
            required
            placeholder="william@example.com"
            className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
          />
        </div>
        <div>
          <label className="block text-xs text-foreground-600 mb-1">Status</label>
          <select name="status" className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50">
            <option value="Veteran">Veteran</option>
            <option value="Active Duty">Active Duty</option>
            <option value="First Responder">First Responder</option>
            <option value="Law Enforcement">Law Enforcement</option>
            <option value="Medical Professional">Medical Professional</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-foreground-600 mb-1">Branch / Agency</label>
          <input
            name="branch"
            placeholder="e.g. US Army, NYPD"
            className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 disabled:opacity-60"
        >
          {loading ? "Assigning…" : "Assign 25% lifetime"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(""); }}
          className="text-xs text-foreground-500 hover:text-foreground-700"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-accent-700">{error}</span>}
      </div>
    </form>
  );
}
