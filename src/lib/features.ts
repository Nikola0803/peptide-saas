// Business modules that are switched off. Data stays in the database; only
// access is removed. Flip to true (and redeploy) to bring a module back.
export const DROPSHIP_ENABLED = false; // supplier logins, /dropship, /suppliers
export const WHOLESALE_ENABLED = false; // /wholesale admin, store wholesale API, case pricing
// Partner applications only: the public inquiry endpoint (used by the
// distributions.evlvpeptides.com Apply form) and the /wholesale inbox where
// staff review them. Case pricing and the partner dashboard/settings APIs
// stay governed by WHOLESALE_ENABLED.
export const WHOLESALE_INQUIRIES_ENABLED = true;

export const BLOCKED_PAGE_PREFIXES = [
  ...(DROPSHIP_ENABLED ? [] : ["/dropship", "/suppliers"]),
  ...(WHOLESALE_ENABLED || WHOLESALE_INQUIRIES_ENABLED ? [] : ["/wholesale"]),
];

export const BLOCKED_API_PREFIXES = [
  ...(DROPSHIP_ENABLED ? [] : ["/api/dropship"]),
  ...(WHOLESALE_ENABLED ? [] : ["/api/store/wholesale"]),
];

// Paths that stay reachable even though a broader prefix above is blocked.
export const ALLOWED_API_PATHS = [
  ...(WHOLESALE_INQUIRIES_ENABLED ? ["/api/store/wholesale/inquiry"] : []),
];

export function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
