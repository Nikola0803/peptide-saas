"use client";

import { useState, useTransition } from "react";
import { setVvgFulfillmentSkus, type VvgSkuFixResult } from "../actions";

export function SetVvgSkusButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<VvgSkuFixResult | null>(null);
  const [error, setError] = useState("");

  function run() {
    setError("");
    startTransition(() => {
      setVvgFulfillmentSkus()
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
        {pending ? "Matching..." : "Run the match"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-medium text-foreground-800">Matched {result.matched.length}:</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs text-foreground-600">
            {result.matched.map((m) => (
              <li key={m.product} className="font-mono">
                {m.product} <span className="font-sans text-foreground-400">(sku {m.sku})</span> &rarr; {m.vvgSku}
              </li>
            ))}
          </ul>

          {result.unmatched.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">
                Couldn&rsquo;t match {result.unmatched.length} &mdash; fill these in by hand on their own product
                page if VVG needs to fulfill them:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs font-mono text-amber-700">
                {result.unmatched.map((u) => (
                  <li key={u.product}>
                    {u.product} (sku {u.sku})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
