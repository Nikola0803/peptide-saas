// Omnisend push for newsletter contacts -- mirrors sendEmail()'s pattern in
// email.ts: gated on an env var, best-effort, never blocks the caller.
//
// Not wired to a real Omnisend account yet -- OMNISEND_API_KEY is unset, so
// pushContactToOmnisend() is a no-op today. Once a key is added to the
// environment, this is the one place that needs to change: swap the
// contactsUrl/fetch body below for Omnisend's real "add/update contact"
// endpoint (POST https://api.omnisend.com/v3/contacts, header
// X-API-KEY: <key>) per their API docs.
export function omnisendConfigured(): boolean {
  return Boolean(process.env.OMNISEND_API_KEY);
}

export async function pushContactToOmnisend(email: string, opts?: { firstName?: string }): Promise<boolean> {
  if (!omnisendConfigured()) {
    console.warn(`[omnisend] Not configured (OMNISEND_API_KEY missing) — skipped pushing ${email}`);
    return false;
  }

  try {
    const res = await fetch("https://api.omnisend.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.OMNISEND_API_KEY!,
      },
      body: JSON.stringify({
        identifiers: [{ type: "email", id: email, channels: { email: { status: "subscribed" } } }],
        firstName: opts?.firstName,
      }),
    });
    if (!res.ok) {
      console.error(`[omnisend] Push failed for ${email}: ${res.status} ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[omnisend] Push errored for ${email}:`, err);
    return false;
  }
}
