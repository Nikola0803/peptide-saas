import crypto from "crypto";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

/**
 * Meta signs every webhook POST body with HMAC-SHA256 (hex, prefixed
 * "sha256=") using the app secret, sent as X-Hub-Signature-256. Same idea
 * as the WooCommerce webhook signature check, different scheme.
 */
export function verifyWhatsAppSignature(rawBody: string, appSecret: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string
): Promise<{ messageId: string }> {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return { messageId: data?.messages?.[0]?.id ?? "" };
}

/** Simple credential check for the "Save & test" button on the Support settings card. */
export async function verifyWhatsAppCredentials(phoneNumberId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(res.status === 401 || res.status === 400 ? "Invalid phone number ID or access token" : `WhatsApp API error ${res.status}`);
  }
}

export async function getDisplayPhoneNumber(phoneNumberId: string, accessToken: string): Promise<string | null> {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.display_phone_number ?? null;
}
