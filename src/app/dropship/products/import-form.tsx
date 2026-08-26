"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importSupplierProducts, type ImportResult } from "./actions";

export function ImportForm() {
  const router = useRouter();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setResult(null);
        const form = e.currentTarget;
        const formData = new FormData(form);
        if (!(formData.get("file") as File)?.size) {
          setError("Choose a file first");
          return;
        }
        setLoading(true);
        try {
          const res = await importSupplierProducts(formData);
          setResult(res);
          form.reset();
          router.refresh();
        } catch (err: any) {
          setError(err?.message ?? "Import failed");
        } finally {
          setLoading(false);
        }
      }}
    >
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
      />
      <button
        disabled={loading}
        className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 disabled:opacity-60"
      >
        {loading ? "Importing…" : "Import CSV"}
      </button>
      {error && <p className="text-xs text-accent-700">{error}</p>}
      {result && (
        <p className="text-xs text-foreground-600">
          Updated {result.updated} product{result.updated === 1 ? "" : "s"}.
          {result.skipped.length > 0 && (
            <>
              {" "}
              Skipped {result.skipped.length}: {result.skipped.map((s) => `${s.sku} (${s.reason})`).join(", ")}
            </>
          )}
        </p>
      )}
    </form>
  );
}
