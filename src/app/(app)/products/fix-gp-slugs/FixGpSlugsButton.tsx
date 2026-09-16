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
        </div>
      )}
    </div>
  );
}
