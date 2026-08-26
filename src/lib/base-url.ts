import "server-only";

// The single source of truth for the CRM's own public URL (e.g.
// "https://crm.evlvpeptides.com") -- used anywhere the app needs to build
// an absolute link back to itself (media URLs, webhook URLs handed to the
// WP plugin, the tracking pixel embed). Deliberately NEVER falls back to
// a request's Host header or origin: behind a reverse proxy, that header
// reflects whatever the proxy forwarded (often an internal hostname or
// the bare server IP), which is exactly the bug this replaces -- every
// caller must set NEXTAUTH_URL correctly in the deployment's .env instead.
export function getBaseUrl(): string {
  const url = process.env.NEXTAUTH_URL;
  if (!url) {
    console.error("[base-url] NEXTAUTH_URL is not set -- absolute URLs built from this will be broken");
    return "";
  }
  return url.replace(/\/$/, "");
}
