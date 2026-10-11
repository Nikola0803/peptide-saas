"use client";

import { useTransition } from "react";
import { updateBookingStatus } from "./actions";

const STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
type BookingStatus = (typeof STATUSES)[number];

export function BookingActions({
  bookingId,
  currentStatus,
}: {
  bookingId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as BookingStatus;
    if (next === currentStatus) return;
    startTransition(() => updateBookingStatus(bookingId, next));
  }

  return (
    <select
      defaultValue={currentStatus}
      onChange={handleChange}
      disabled={isPending}
      className="text-xs rounded border border-background-200 bg-background-50 px-2 py-1 text-foreground-700 focus:outline-none focus:border-primary-400 disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.charAt(0) + s.slice(1).toLowerCase().replace("_", "-")}
        </option>
      ))}
    </select>
  );
}
