"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function updateBookingStatus(
  bookingId: string,
  status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW",
) {
  const { organization } = await requireOrg();

  await prisma.booking.updateMany({
    where: { id: bookingId, organizationId: organization.id },
    data: { status },
  });

  revalidatePath("/bookings");
}
