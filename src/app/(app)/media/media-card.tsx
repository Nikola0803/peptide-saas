"use client";

import { useState } from "react";
import { deleteMedia } from "./actions";

export function MediaCard({
  id,
  url,
  absoluteUrl,
  filename,
  mimeType,
  sizeLabel,
}: {
  id: string;
  url: string;
  absoluteUrl: string;
  filename: string;
  mimeType: string;
  sizeLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isImage = mimeType.startsWith("image/");

  return (
    <div className="rounded-lg border border-background-200 bg-background-50 overflow-hidden">
      <div className="aspect-square bg-background-100 flex items-center justify-center overflow-hidden">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <i className="ri-file-text-line text-3xl text-foreground-400" />
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs text-foreground-800 truncate" title={filename}>
          {filename}
        </p>
        <p className="text-[10px] text-foreground-500">{sizeLabel}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(absoluteUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex-1 text-[11px] border border-background-300 rounded px-2 py-1 text-foreground-700 hover:bg-background-100"
          >
            {copied ? "Copied" : "Copy URL"}
          </button>
          <button
            disabled={deleting}
            onClick={async () => {
              if (!confirm(`Delete "${filename}"? This can't be undone.`)) return;
              setDeleting(true);
              await deleteMedia(id).catch((err) => alert(err?.message ?? "Delete failed"));
            }}
            className="text-[11px] border border-background-300 rounded px-2 py-1 text-accent-700 hover:bg-accent-50 disabled:opacity-60"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
