import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * A headless storefront (e.g. evlv-site) has no session with this app — it
 * identifies itself on every request via a trusted header pair instead:
 * `x-store-domain` (the Brand.domain it claims to be) + `x-store-api-key`
 * (the owning Organization.apiKey). Both must match and the domain must
 * belong to that org's brands, or the request is rejected. This is the
 * server-to-server equivalent of the WooCommerce plugin's install-time
 * handshake (see Organization.apiKey's doc comment in schema.prisma) —
 * except here it's checked on every call, not just once at install.
 */
export interface StoreContext {
  organizationId: string;
  brandId: string;
  brandDomain: string;
}

export async function resolveHeaderOverride(req: NextRequest): Promise<StoreContext | null> {
  const domain = req.headers.get("x-store-domain")?.toLowerCase().trim();
  const apiKey = req.headers.get("x-store-api-key")?.trim();
  if (!domain || !apiKey) return null;

  const organization = await prisma.organization.findUnique({ where: { apiKey } });
  if (!organization) return null;

  const brand = await prisma.brand.findFirst({
    where: { organizationId: organization.id, domain },
  });
  if (!brand) return null;

  return { organizationId: organization.id, brandId: brand.id, brandDomain: brand.domain };
}
