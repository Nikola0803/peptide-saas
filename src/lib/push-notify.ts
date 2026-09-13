// Phone push notifications for new orders, via ntfy.sh -- a free public
// pub/sub broker with no account/API key needed. NTFY_TOPIC just needs to
// be a hard-to-guess string (treat it like a password: anyone who knows it
// can publish to it or read your notifications), set once in .env, and
// subscribed to from the ntfy app (iOS/Android/web) on your phone.
// Best-effort: a failed push never blocks or fails order placement.
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const NTFY_BASE_URL = process.env.NTFY_BASE_URL || "https://ntfy.sh";

export function pushNotifyConfigured(): boolean {
  return Boolean(NTFY_TOPIC);
}

export async function pushNotifyNewOrder(input: { orderNumber: string; customerName: string; totalFormatted: string; itemCount: number }): Promise<void> {
  if (!NTFY_TOPIC) {
    console.warn(`[push-notify] NTFY_TOPIC not set — skipped push for order ${input.orderNumber}`);
    return;
  }
  try {
    await fetch(`${NTFY_BASE_URL}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: `New order ${input.orderNumber}`,
        Tags: "moneybag",
        Priority: "high",
      },
      body: `${input.customerName} — ${input.totalFormatted} (${input.itemCount} item${input.itemCount === 1 ? "" : "s"})`,
    });
  } catch (err) {
    console.error("[push-notify] failed to send", err);
  }
}
