"use client";

import { useState, useTransition } from "react";
import { fixGpSlugs, type GpSlugFixResult } from "../actions";

export function FixGpSlugsButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GpSlugFixResult | null>(null);
  const [error, setError] = useState("");

  function run() {
    setError("");
    startTransition(() => {
      fixGpSlugs()
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
        {pending ? "Fixing..." : "Run the fix"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 space-y-3">
          {result.changed.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-foreground-800">Renamed {result.changed.length}:</p>
              <ul className="space-y-1 text-xs text-foreground-600">
                {result.changed.map((c) => (
                  <li key={c.from} className="font-mono">
                    {c.from} &rarr; {c.to}
                    <span className="ml-2 font-sans text-foreground-400">
                      ({c.product} &middot; {c.brand})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-foreground-600">Nothing to rename -- all 10 were already fixed.</p>
          )}
          {result.alreadyDone.length > 0 && (
            <p className="text-xs text-foreground-400">
              Already done (skipped): {result.alreadyDone.join(", ")}
            </p>
          )}
          {result.notFound.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">
                Couldn&rsquo;t find these -- neither the old nor the new slug exists as an active mapping:
              </p>
              <p className="mt-1 text-xs font-mono text-amber-700">{result.notFound.join(", ")}</p>
              <p className="mt-1 text-xs text-amber-700">
                The live slug in the CRM probably isn&rsquo;t exactly what this tool expects -- check that
                product&rsquo;s storefront mapping directly.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
