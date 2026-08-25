import crypto from "crypto";
import bcrypt from "bcryptjs";

// Storefront customers are a separate identity from the staff dashboard's
// NextAuth session — they never see this app's UI, so there's no reason to
// route them through NextAuth. Instead /api/store/auth/* hands evlv-site an
// opaque bearer token it stores itself and replays on
// /api/store/account/orders; this file is the whole of that mechanism: a
// signed, expiring JSON payload, HMAC'd so it can't be forged without the
// secret, kept dependency-free (no jsonwebtoken) since it's a single flat
// claim, not general-purpose JWT.

interface CustomerTokenPayload {
  contactId: string;
  organizationId: string;
  brandId: string;
  email: string;
  exp: number; // unix seconds
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — a storefront login should stick

function secret(): string {
  const key = process.env.CUSTOMER_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error("CUSTOMER_AUTH_SECRET (or NEXTAUTH_SECRET) must be set to issue/verify customer tokens");
  }
  return key;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signCustomerToken(claims: Omit<CustomerTokenPayload, "exp">): string {
  const payload: CustomerTokenPayload = { ...claims, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyCustomerToken(token: string | null | undefined): CustomerTokenPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: CustomerTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}
