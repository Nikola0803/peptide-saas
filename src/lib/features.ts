// Business modules that are switched off. Data stays in the database; only
// access is removed. Flip to true (and redeploy) to bring a module back.
export const DROPSHIP_ENABLED = false; // supplier logins, /dropship, /suppliers
export const WHOLESALE_ENABLED = false; // /wholesale admin, store wholesale API, case pricing

export const BLOCKED_PAGE_PREFIXES = [
  ...(DROPSHIP_ENABLED ? [] : ["/dropship", "/suppliers"]),
  ...(WHOLESALE_ENABLED ? [] : ["/wholesale"]),
];

export const BLOCKED_API_PREFIXES = [
  ...(DROPSHIP_ENABLED ? [] : ["/api/dropship"]),
  ...(WHOLESALE_ENABLED ? [] : ["/api/store/wholesale"]),
];

export function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
