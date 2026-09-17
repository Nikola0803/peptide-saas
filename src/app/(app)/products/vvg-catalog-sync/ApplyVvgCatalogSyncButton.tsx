"use client";

import { useState, useTransition } from "react";
import { applyVvgCatalogSync, type VvgCatalogSyncResult } from "../actions";

export function ApplyVvgCatalogSyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<VvgCatalogSyncResult | null>(null);
  const [error, setError] = useState("");

  function run() {
    setError("");
    startTransition(() => {
      applyVvgCatalogSync()
        .then((r) => setResult(r))
        .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."));
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-background-50 hover:bg-primary-600 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Syncing..." : "Run the sync"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-medium text-foreground-800">Updated {result.updated.length}:</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs text-foreground-600">
            {result.updated.map((u) => (
              <li key={u.product} className="font-mono">
                {u.product} <span className="font-sans text-foreground-400">(sku {u.sku})</span>
                {u.retail && ` — retail ${u.retail}`}
                {u.wholesale && ` — COG ${u.wholesale}`}
                {u.stock != null && ` — stock ${u.stock}`}
              </li>
            ))}
          </ul>

          {result.skuConflicts.length > 0 && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-800">
                {result.skuConflicts.length} SKU couldn&rsquo;t be renamed &mdash; another product already uses it:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs font-mono text-red-700">
                {result.skuConflicts.map((c) => (
                  <li key={c.vvgSku}>
                    {c.product}: wanted sku {c.vvgSku}, already used by {c.conflictingSku}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.unmatched.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">
                {result.unmatched.length} VVG SKU(s) had no matching product &mdash; likely a genuinely new item not
                yet in the CRM:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs font-mono text-amber-700">
                {result.unmatched.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}

          {result.skippedNoPrice.length > 0 && (
            <p className="text-xs text-foreground-400">
              Skipped (nothing usable in that row yet): {result.skippedNoPrice.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
