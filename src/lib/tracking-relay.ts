import crypto from "crypto";

type RelayEvent = {
  eventName: string;
  visitorId: string;
  valueCents?: number | null;
  currency?: string | null;
  pageUrl?: string | null;
  clickIds?: Record<string, string> | null;
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// Meta requires its own event vocabulary — map our internal names once here
// rather than scattering the mapping across callers.
const META_EVENT_MAP: Record<string, string> = {
  page_view: "PageView",
  view_content: "ViewContent",
  add_to_cart: "AddToCart",
  lead: "Lead",
  purchase: "Purchase",
};

export async function relayToMeta(
  pixelId: string,
  accessToken: string,
  event: RelayEvent,
  email?: string
): Promise<void> {
  const body = {
    data: [
      {
        event_name: META_EVENT_MAP[event.eventName] ?? "CustomEvent",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `${event.visitorId}-${event.eventName}-${Date.now()}`,
        action_source: "website",
        event_source_url: event.pageUrl ?? undefined,
        user_data: {
          external_id: sha256(event.visitorId),
          ...(email ? { em: sha256(email) } : {}),
          fbc: event.clickIds?.fbclid
            ? `fb.1.${Math.floor(Date.now() / 1000)}.${event.clickIds.fbclid}`
            : undefined,
        },
        custom_data: {
          value: event.valueCents ? event.valueCents / 100 : undefined,
          currency: event.currency ?? "USD",
        },
      },
    ],
  };

  const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Meta CAPI ${res.status}: ${await res.text()}`);
  }
}

const TIKTOK_EVENT_MAP: Record<string, string> = {
  page_view: "ViewContent",
  view_content: "ViewContent",
  add_to_cart: "AddToCart",
  lead: "SubmitForm",
  purchase: "CompletePayment",
};

export async function relayToTiktok(
  pixelId: string,
  accessToken: string,
  event: RelayEvent,
  email?: string
): Promise<void> {
  const body = {
    event_source: "web",
    event_source_id: pixelId,
    data: [
      {
        event: TIKTOK_EVENT_MAP[event.eventName] ?? "CustomEvent",
        event_time: Math.floor(Date.now() / 1000),
        user: {
          external_id: sha256(event.visitorId),
          ...(email ? { email: sha256(email) } : {}),
          ttclid: event.clickIds?.ttclid ?? undefined,
        },
        page: { url: event.pageUrl ?? undefined },
        properties: {
          value: event.valueCents ? event.valueCents / 100 : undefined,
          currency: event.currency ?? "USD",
        },
      },
    ],
  };

  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Access-Token": accessToken },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`TikTok Events API ${res.status}: ${await res.text()}`);
  }
}

export async function relayToGa4(measurementId: string, apiSecret: string, event: RelayEvent): Promise<void> {
  const body = {
    client_id: event.visitorId,
    events: [
      {
        name: event.eventName,
        params: {
          value: event.valueCents ? event.valueCents / 100 : undefined,
          currency: event.currency ?? "USD",
          page_location: event.pageUrl ?? undefined,
        },
      },
    ],
  };

  const res = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  // GA4's Measurement Protocol returns 204 with no body on success and
  // doesn't validate much synchronously — a non-2xx is still worth logging.
  if (!res.ok) {
    throw new Error(`GA4 Measurement Protocol ${res.status}`);
  }
}
