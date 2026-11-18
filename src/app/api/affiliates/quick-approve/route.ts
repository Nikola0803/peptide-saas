import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeHtml } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";
import { approvePendingAffiliate, verifyAffiliateApprovalToken } from "@/lib/affiliate-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/affiliates/quick-approve?token=...  -> confirm page (email link)
// POST /api/affiliates/quick-approve?token=...  -> approves (ntfy action / confirm button)
//
// GET never changes anything, because mail scanners and link previews open
// links automatically. The token is signed, expires after 7 days, and is
// scoped to one PENDING affiliate (see src/lib/affiliate-approval.ts).

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#eef2ef;color:#102d28;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.08)}h1{font-size:22px;margin:0 0 12px}p{line-height:1.5;color:#52645f;margin:0 0 12px}dl{margin:16px 0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:14px}dt{color:#60706b}dd{margin:0;word-break:break-all}button,.btn{display:inline-block;border:0;border-radius:10px;background:#102d28;color:#fff;font-weight:700;padding:14px 20px;font-size:15px;cursor:pointer;text-decoration:none;width:100%;text-align:center;box-sizing:border-box}.link{display:block;margin-top:14px;text-align:center;color:#16483f;font-size:14px}</style></head><body><main>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function profileLink(affiliateId: string) {
  const base = getBaseUrl();
  return base ? `<a class="link" href="${escapeHtml(`${base}/affiliates/${affiliateId}`)}">Open partner profile in the CRM</a>` : "";
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const affiliateId = verifyAffiliateApprovalToken(token);
  if (!affiliateId) return page("Link expired", "<h1>This approval link has expired</h1><p>Approve the application from the Affiliates page in the CRM instead.</p>", 400);

  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate) return page("Not found", "<h1>Application not found</h1>", 404);
  if (affiliate.status !== "PENDING") {
    return page("Already handled", `<h1>${escapeHtml(affiliate.name)} is already ${affiliate.status.toLowerCase()}</h1><p>Nothing to do here.</p>${profileLink(affiliate.id)}`);
  }

  return page(
    "Approve partner",
    `<h1>Approve ${escapeHtml(affiliate.name)}?</h1><p>They get partner access right away at ${affiliate.ratePercent}% commission and receive the approval email.</p>
<dl><dt>Email</dt><dd>${escapeHtml(affiliate.email ?? "")}</dd><dt>Channel</dt><dd>${escapeHtml(affiliate.socialLink || "Not provided")}</dd><dt>Code</dt><dd>${escapeHtml(affiliate.couponCode)}</dd><dt>Applied</dt><dd>${escapeHtml(affiliate.createdAt.toUTCString())}</dd></dl>
<form method="post" action="?token=${escapeHtml(encodeURIComponent(token ?? ""))}"><button type="submit">Approve partner</button></form>${profileLink(affiliate.id)}`
  );
}

export async function POST(req: NextRequest) {
  const affiliateId = verifyAffiliateApprovalToken(req.nextUrl.searchParams.get("token"));
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
  if (!affiliateId) {
    return wantsHtml
      ? page("Link expired", "<h1>This approval link has expired</h1><p>Approve the application from the Affiliates page in the CRM instead.</p>", 400)
      : NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const result = await approvePendingAffiliate(affiliateId);
  if (!result) {
    return wantsHtml ? page("Not found", "<h1>Application not found</h1>", 404) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { affiliate, changed } = result;
  if (!wantsHtml) return NextResponse.json({ ok: true, status: affiliate.status, changed });
  return changed
    ? page("Approved", `<h1>${escapeHtml(affiliate.name)} is approved</h1><p>Their partner command center at /partner is live now, and the approval email is on its way.</p>${profileLink(affiliate.id)}`)
    : page("Already handled", `<h1>${escapeHtml(affiliate.name)} is already ${affiliate.status.toLowerCase()}</h1><p>Nothing changed.</p>${profileLink(affiliate.id)}`);
}
