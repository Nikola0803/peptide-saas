import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bearerToken, verifyCustomerToken } from "@/lib/customer-auth";
import type { StoreContext } from "@/lib/store-context";

// Shared by every /api/store/{affiliate,wholesale}/* route that's a role
// on an existing storefront Contact rather than its own login (affiliate
// and wholesale-partner portals both authenticate this way -- see
// AFFILIATE-PORTAL.md / WHOLESALE-PARTNER-PORTAL.md). Resolves the same
// customer token /api/store/account/orders already uses.
export async function resolveContactFromToken(req: NextRequest, store: StoreContext, body: any) {
  const token = bearerToken(req) ?? body?.token;
  const claims = verifyCustomerToken(token);
  if (!claims || claims.organizationId !== store.organizationId || claims.brandId !== store.brandId) {
    return null;
  }
  return prisma.contact.findUnique({ where: { id: claims.contactId } });
}
