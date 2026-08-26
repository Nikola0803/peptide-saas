"use client";

import { useState } from "react";
import { syncContactToMailchimp } from "../actions";

export function SyncMailchimpButton({ contactId }: { contactId: string }) {
  const [status, setStatus] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  return (
    <div>
      <button
        disabled={syncing}
        onClick={async () => {
          setSyncing(true);
          setStatus(null);
          const result = await syncContactToMailchimp(contactId).catch((err) => ({ ok: false, reason: err?.message }));
          setStatus(result);
          setSyncing(false);
        }}
        className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100 disabled:opacity-60"
      >
        {syncing ? "Syncing…" : "Sync to Mailchimp"}
      </button>
      {status && (
        <p className={`text-xs mt-1.5 ${status.ok ? "text-secondary-700" : "text-accent-700"}`}>
          {status.ok ? "Synced." : status.reason}
        </p>
      )}
    </div>
  );
}
