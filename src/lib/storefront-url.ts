import "server-only";

// Absolute link BACK TO THE STOREFRONT (e.g. "https://evlvpeptides.com"),
// as opposed to getBaseUrl() in base-url.ts which builds links to this CRM
// app's own domain. Needed for anything a customer clicks from an email --
// an unsubscribe link, an account-removal confirmation -- since those
// pages live on the storefront (evlv-site), not here.
//
// Brand.domain is stored bare (no protocol, e.g. "evlvpeptides.com") --
// see the same convention in src/lib/store-context.ts and
// src/app/(app)/webhooks/actions.ts.
export function getStorefrontUrl(brandDomain: string, path: string = ""): string {
  const domain = brandDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `https://${domain}${path ? suffix : ""}`;
}
