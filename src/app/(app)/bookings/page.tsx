import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { shortDate, dateTime } from "@/lib/format";
import { BookingActions } from "./actions-client";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; brand?: string }>;
}) {
  const { organization } = await requireOrg();
  const { status, brand: brandFilter } = await searchParams;

  const [bookings, brands] = await Promise.all([
    prisma.booking.findMany({
      where: {
        organizationId: organization.id,
        ...(status ? { status: status as never } : {}),
        ...(brandFilter ? { brandId: brandFilter } : {}),
      },
      include: { brand: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.brand.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const statusGroups = {
    REQUESTED: bookings.filter((b) => b.status === "REQUESTED").length,
    CONFIRMED: bookings.filter((b) => b.status === "CONFIRMED").length,
    COMPLETED: bookings.filter((b) => b.status === "COMPLETED").length,
    CANCELLED: bookings.filter((b) => b.status === "CANCELLED").length,
    NO_SHOW: bookings.filter((b) => b.status === "NO_SHOW").length,
  };

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Education calls booked from EVLV Today and the brand hub"
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total" value={String(bookings.length)} />
        <StatCard label="Requested" value={String(statusGroups.REQUESTED)} hint="Awaiting confirmation" />
        <StatCard label="Confirmed" value={String(statusGroups.CONFIRMED)} />
        <StatCard label="Completed" value={String(statusGroups.COMPLETED)} />
        <StatCard label="Cancelled / no-show" value={String(statusGroups.CANCELLED + statusGroups.NO_SHOW)} />
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="text-sm rounded-md border border-background-200 bg-background-50 px-3 py-2 text-foreground-700 focus:outline-none focus:border-primary-400"
          onChange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
        >
          <option value="">All statuses</option>
          <option value="REQUESTED">Requested</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="NO_SHOW">No-show</option>
        </select>
        {brands.length > 1 && (
          <select
            name="brand"
            defaultValue={brandFilter ?? ""}
            className="text-sm rounded-md border border-background-200 bg-background-50 px-3 py-2 text-foreground-700 focus:outline-none focus:border-primary-400"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="text-sm px-4 py-2 rounded-md bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors"
        >
          Filter
        </button>
        {(status || brandFilter) && (
          <a
            href="/bookings"
            className="text-sm px-4 py-2 rounded-md border border-background-200 text-foreground-500 hover:text-foreground-800 transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {bookings.length === 0 ? (
        <EmptyState
          icon="ri-calendar-check-line"
          title="No bookings yet"
          body="Education calls booked via EVLV Today or the brand hub appear here. Connect your storefront using the brand's Booking Public Key from the Settings page."
        />
      ) : (
        <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="py-2.5 px-4 font-medium">Contact</th>
                <th className="py-2.5 px-4 font-medium">Requested</th>
                <th className="py-2.5 px-4 font-medium">Source</th>
                <th className="py-2.5 px-4 font-medium">Topics / Purpose</th>
                <th className="py-2.5 px-4 font-medium">Channel</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Submitted</th>
                <th className="py-2.5 px-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => {
                const displayName =
                  [booking.firstName, booking.lastName].filter(Boolean).join(" ") ||
                  booking.name ||
                  booking.email;
                const topics =
                  booking.interests.length > 0
                    ? booking.interests.join(", ")
                    : booking.purpose ?? "—";
                return (
                  <tr key={booking.id} className="border-b border-background-100 last:border-0 hover:bg-background-100">
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground-800">{displayName}</div>
                      <div className="text-xs text-foreground-500">{booking.email}</div>
                      {booking.phone && (
                        <div className="text-xs text-foreground-400">{booking.phone}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                      <div className="font-medium">{booking.requestedDate}</div>
                      <div className="text-xs text-foreground-500">{booking.requestedTime} · {booking.timezone}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-foreground-600">
                      {booking.brand?.name ?? booking.source ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-xs text-foreground-600 max-w-[200px] truncate" title={topics}>
                      {topics}
                    </td>
                    <td className="py-3 px-4 text-xs text-foreground-600 capitalize">
                      {booking.channel}
                    </td>
                    <td className="py-3 px-4">
                      <Badge status={booking.status} />
                    </td>
                    <td className="py-3 px-4 text-xs text-foreground-500 whitespace-nowrap">
                      {shortDate(booking.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <BookingActions bookingId={booking.id} currentStatus={booking.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
