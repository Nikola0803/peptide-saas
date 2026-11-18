import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";

// One-tap approval for new partner applications. The owner gets a push
// (ntfy "Approve" action button) and an email with an approve link, both
// carrying a signed, expiring token scoped to ONE affiliate. The token only
// moves that affiliate from PENDING to APPROVED; it cannot reject, edit the
// rate, or touch any other record, and it stops working once the affiliate
// is no longer pending. Applicants still always start as PENDING at 15%.

const PURPOSE = "affiliate-quick-approve:v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const key = process.env.CUSTOMER_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("NEXTAUTH_SECRET must be set to sign affiliate approval links");
  return key;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(`${PURPOSE}.${body}`).digest("base64url");
}

export function createAffiliateApprovalToken(affiliateId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ a: affiliateId, e: now + TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyAffiliateApprovalToken(token: string | null | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { a?: unknown; e?: unknown };
    if (typeof payload.a !== "string" || typeof payload.e !== "number" || payload.e < now) return null;
    return payload.a;
  } catch {
    return null;
  }
}

export function affiliateQuickApproveUrl(affiliateId: string): string {
  const base = getBaseUrl();
  if (!base) return "";
  return `${base}/api/affiliates/quick-approve?token=${encodeURIComponent(createAffiliateApprovalToken(affiliateId))}`;
}

/**
 * Approves a pending affiliate and emails them the approval template.
 * Returns the affiliate, or null when it does not exist in that
 * organization. An affiliate that is not PENDING is returned unchanged so
 * a second tap never re-approves someone who was rejected meanwhile.
 */
export async function approvePendingAffiliate(affiliateId: string, organizationId?: string) {
  const affiliate = await prisma.affiliate.findFirst({
    where: { id: affiliateId, ...(organizationId ? { organizationId } : {}) },
  });
  if (!affiliate) return null;
  if (affiliate.status !== "PENDING") return { affiliate, changed: false };

  const updated = await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: { status: "APPROVED" },
  });
  if (updated.email) {
    sendTemplate(updated.organizationId, "affiliate_approved", updated.email, { affiliateName: updated.name }).catch((err) =>
      console.error("Affiliate approval email failed", err)
    );
  }
  return { affiliate: updated, changed: true };
}
