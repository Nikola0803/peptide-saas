import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const ACTIVE_BRAND_COOKIE = "cc_active_brand";

export async function getActiveBrand(organizationId: string) {
  const requestedId = cookies().get(ACTIVE_BRAND_COOKIE)?.value;
  if (requestedId === "all") return null;

  if (requestedId) {
    const selected = await prisma.brand.findFirst({
      where: { id: requestedId, organizationId },
    });
    if (selected) return selected;
  }

  return prisma.brand.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
}

