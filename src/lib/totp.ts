import { generateSecret, generateURI, generateSync, verifySync } from "otplib";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const ALGO = "aes-256-gcm";
const TOTP_OPTS = { algorithm: "sha1" as const, digits: 6, period: 30 };

function getKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("TOTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = (cipher as any).getAuthTag() as Buffer;
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(".");
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret format");
  const [ivHex, tagHex, encHex] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  (decipher as any).setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateTotpSecret(email: string) {
  const secret = generateSecret({ length: 20 });
  const otpauth = generateURI({
    strategy: "totp",
    issuer: "EVLV Command Center",
    label: email,
    secret,
    ...TOTP_OPTS,
  });
  return { secret, otpauth };
}

export function verifyTotp(encryptedSecret: string, token: string): boolean {
  try {
    const secret = decryptSecret(encryptedSecret);
    const result = verifySync({ token, secret, ...TOTP_OPTS });
    return result.valid === true;
  } catch {
    return false;
  }
}

// 8 recovery codes — 4+4 format like ABCD-1234, easy to read and type
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: 8 }, () => {
    const a = randomBytes(2).toString("hex").toUpperCase();
    const b = randomBytes(2).toString("hex").toUpperCase();
    return `${a}-${b}`;
  });
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = code.replace(/-/g, "").toUpperCase();
  return bcrypt.hash(normalized, 10);
}

export async function verifyRecoveryCode(input: string, hash: string): Promise<boolean> {
  const normalized = input.replace(/-/g, "").toUpperCase();
  return bcrypt.compare(normalized, hash);
}
