"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function slugify(name: string): string {
  return "brand_" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Manual brand creation, for a site that isn't (or can't be) running the
 * WP plugin. Starts unverified — `verificationToken` is already set by the
 * schema default, the operator just needs to paste it on their homepage
 * and click Verify (see verifyBrandOwnership below).
 */
export async function createBrand(formData: FormData) {
  const { organization } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const rawUrl = String(formData.get("domain") ?? "").trim();
  if (!name || !rawUrl) throw new Error("Name and website URL are both required");

  const domain = normalizeUrl(rawUrl).replace(/^https?:\/\//, "").replace(/\/$/, "");

  let slug = slugify(name);
  const existing = await prisma.brand.findUnique({
    where: { organizationId_slug: { organizationId: organization.id, slug } },
  });
  if (existing) slug = `${slug}_${Date.now().toString(36)}`;

  const brand = await prisma.brand.create({
    data: { organizationId: organization.id, name, domain, slug, status: "PENDING" },
  });

  await prisma.trackingConfig.create({ data: { brandId: brand.id } });

  revalidatePath("/webhooks");
  revalidatePath("/dashboard");
}

export type VerifyState = { error: string | null; success: boolean };

/**
 * The "click Verify" step — fetches the site's homepage and checks whether
 * the operator actually pasted the verification token somewhere in the
 * HTML. Deliberately loose about *where* (meta tag, footer text, HTML
 * comment — anywhere) so it works regardless of how much access someone
 * has to their own theme.
 *
 * Signature is (brandId, prevState, formData) rather than just (formData)
 * so it can be partially applied with .bind(null, brandId) and still fit
 * useFormState's (prevState, formData) => newState shape on the client —
 * that's what lets a failed verification show an inline error instead of
 * crashing the page.
 */
export async function verifyBrandOwnership(
  brandId: string,
  _prevState: VerifyState,
  _formData: FormData
): Promise<VerifyState> {
  const { organization } = await requireOrg();

  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: organization.id } });
  if (!brand) return { error: "Brand not found", success: false };
  if (brand.verifiedAt) return { error: null, success: true };

  const urlsToTry = [`https://${brand.domain}`, `http://${brand.domain}`];
  let html: string | null = null;
  let lastError = "Could not reach the site";

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "CommandCenterVerificationBot/1.0" },
      });
      if (res.ok) {
        html = await res.text();
        break;
      }
      lastError = `Site responded with HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err?.name === "TimeoutError" ? "Site took too long to respond" : "Could not reach the site";
    }
  }

  if (html === null) {
    return { error: lastError, success: false };
  }

  if (!html.includes(brand.verificationToken)) {
    return {
      error: "Verification code not found on the page — double-check it's pasted and the page is cached/updated, then try again.",
      success: false,
    };
  }

  await prisma.brand.update({
    where: { id: brand.id },
    data: { verifiedAt: new Date(), status: "CONNECTED" },
  });

  revalidatePath("/webhooks");
  revalidatePath("/dashboard");

  return { error: null, success: true };
}

/** Removes a brand entirely — used for clearing out the seeded demo brands. */
export async function deleteBrand(brandId: string) {
  const { organization } = await requireOrg();
  await prisma.brand.delete({ where: { id: brandId, organizationId: organization.id } });
  revalidatePath("/webhooks");
  revalidatePath("/dashboard");
}
