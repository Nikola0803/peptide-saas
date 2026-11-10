import geoip from "geoip-lite";
import { headers } from "next/headers";

// Countries whose staff may access the CRM admin dashboard.
const ADMIN_ALLOWED_COUNTRIES = new Set(["RS"]); // Serbia

export function getClientIp(): string | null {
  try {
    const h = headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return h.get("x-real-ip");
  } catch {
    return null;
  }
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.")
  );
}

// Returns true when the request IP is allowed to access admin routes.
// Private/loopback IPs are always allowed (cron jobs, local dev).
// Unknown IPs (no geo data) fail open to avoid blocking VPN/proxy users.
export function isAdminIpAllowed(): boolean {
  const ip = getClientIp();
  if (!ip) return true;
  if (isPrivateIp(ip)) return true;
  const geo = geoip.lookup(ip);
  if (!geo) return true; // fail open for unresolvable IPs
  return ADMIN_ALLOWED_COUNTRIES.has(geo.country);
}
