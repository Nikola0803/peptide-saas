import crypto from "crypto";
import { hashPassword, verifyPassword, bearerToken } from "@/lib/customer-auth";

// Affiliate portal sessions -- same signed-opaque-token mechanism as
// customer-auth.ts, kept as a separate module because an affiliate is a
// distinct identity from a storefront customer (evlv-site stores their
// tokens under different localStorage keys -- see its affiliate-auth.ts),
// not because the crypto needs to differ.

interface AffiliateTokenPayload {
  affiliateId: string;
  organizationId: string;
  exp: number; // unix seconds
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const key = process.env.CUSTOMER_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error("CUSTOMER_AUTH_SECRET (or NEXTAUTH_SECRET) must be set to issue/verify affiliate tokens");
  }
  return key;
}

export { hashPassword, verifyPassword, bearerToken };

export function signAffiliateToken(claims: Omit<AffiliateTokenPayload, "exp">): string {
  const payload: AffiliateTokenPayload = { ...claims, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyAffiliateToken(token: string | null | undefined): AffiliateTokenPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: AffiliateTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// e.g. "JORDAN4F2A" -- first name (or "AFF" if none given) plus 4 random
// alphanumerics, re-rolled on collision. Doubles as both slug and
// couponCode, matching how admin-created affiliates already work.
export async function generateAffiliateCode(
  firstName: string | undefined,
  isTaken: (code: string) => Promise<boolean>
): Promise<string> {
  const base = (firstName || "AFF").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 12) || "AFF";
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    let suffix = "";
    for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    const code = `${base}${suffix}`;
    if (!(await isTaken(code))) return code;
  }
  throw new Error("Could not generate a unique affiliate code");
}
