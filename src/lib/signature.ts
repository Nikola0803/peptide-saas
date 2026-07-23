import crypto from "crypto";

/**
 * WooCommerce's native webhook system signs every delivery with
 * HMAC-SHA256 (base64-encoded) of the raw request body, using the secret
 * configured on the webhook, sent as the `X-WC-Webhook-Signature` header.
 * We reuse that per-brand secret as the WooCommerce webhook secret (set
 * either manually per the setup steps on the Webhooks page, or
 * auto-configured by the plugin via wc_create_webhook), so verification
 * here has to match WooCommerce's own scheme exactly rather than inventing
 * a custom one.
 */
export function verifySignature(rawBody: string, secret: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signPayload(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}
