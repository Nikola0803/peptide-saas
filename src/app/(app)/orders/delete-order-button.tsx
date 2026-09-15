"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteOrder } from "./actions";

export function DeleteOrderButton({
  orderId,
  orderNumber,
  redirectTo,
  size = "sm",
}: {
  orderId: string;
  orderNumber: string;
  // Set on the order detail page, since the row it's showing no longer
  // exists once the delete succeeds -- the orders list just re-renders
  // without it, so it has no need for this.
  redirectTo?: string;
  // "sm" matches the compact per-row buttons in the orders table; "md"
  // matches the larger action-bar buttons on the order detail page.
  size?: "sm" | "md";
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const className =
    size === "md"
      ? "text-sm border border-background-300 rounded-md px-3 py-1.5 text-accent-700 hover:bg-accent-50 disabled:opacity-60"
      : "text-[11px] border border-background-300 rounded px-2 py-1 text-accent-700 hover:bg-accent-50 disabled:opacity-60 whitespace-nowrap";

  return (
    <button
      type="button"
      disabled={deleting}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Permanently delete order #${orderNumber}? This can't be undone.`)) return;
        setDeleting(true);
        try {
          await deleteOrder(orderId);
          if (redirectTo) router.push(redirectTo);
        } catch (err) {
          alert(err instanceof Error ? err.message : "Delete failed");
          setDeleting(false);
        }
      }}
      className={className}
    >
      {deleting ? "…" : "Delete"}
    </button>
  );
}
