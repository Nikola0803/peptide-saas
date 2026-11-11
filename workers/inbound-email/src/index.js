import PostalMime from "postal-mime";

/**
 * Cloudflare Email Worker — receives inbound emails routed to
 * *@inbound.evlvpeptides.com and forwards them as JSON to the CRM's
 * /api/email/inbound webhook.
 *
 * Required Worker env vars (set via Cloudflare dashboard or wrangler secret):
 *   WEBHOOK_SECRET  — shared secret; set RESEND_INBOUND_SECRET to the same
 *                     value in the CRM's .env on the VPS.
 *   CRM_WEBHOOK_URL — defaults to https://crm.evlvpeptides.com/api/email/inbound
 */

async function hmacHex(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async email(message, env, _ctx) {
    const crmUrl =
      env.CRM_WEBHOOK_URL ||
      "https://crm.evlvpeptides.com/api/email/inbound";

    // Parse raw MIME email
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await new PostalMime().parse(raw);

    const payload = JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: parsed.subject ?? null,
      text: parsed.text ?? null,
      html: parsed.html ?? null,
    });

    const headers = { "Content-Type": "application/json" };
    if (env.WEBHOOK_SECRET) {
      headers["resend-signature"] = await hmacHex(payload, env.WEBHOOK_SECRET);
    }

    const res = await fetch(crmUrl, { method: "POST", headers, body: payload });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CRM webhook returned ${res.status}: ${text}`);
    }
  },
};
