import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { relayToMeta, relayToTiktok, relayToGa4 } from "@/lib/tracking-relay";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// POST /api/t
// body: { publicKey, event, visitorId, valueCents?, currency?, pageUrl?, clickIds?, email? }
//
// Called by the embed snippet (see /webhooks — no, /tracking-pixels — page
// for the exact <script> tag). `publicKey` identifies the brand without
// exposing anything secret; it's fine to ship in client-side JS. This
// endpoint logs the event, then fires the server-side relay to whichever
// ad platforms this brand has configured — that relay is what still
// attributes a conversion even when the visitor's browser blocks
// client-side pixels.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.publicKey || !body?.event || !body?.visitorId) {
    return NextResponse.json({ error: "publicKey, event, and visitorId are required" }, { status: 400, headers: CORS_HEADERS });
  }

  const config = await prisma.trackingConfig.findUnique({
    where: { publicKey: body.publicKey },
    include: { brand: true },
  });
  if (!config) {
    return NextResponse.json({ error: "Unknown tracking key" }, { status: 404, headers: CORS_HEADERS });
  }

  const trackingEvent = await prisma.trackingEvent.create({
    data: {
      organizationId: config.brand.organizationId,
      brandId: config.brandId,
      eventName: body.event,
      visitorId: body.visitorId,
      valueCents: body.valueCents ?? null,
      currency: body.currency ?? null,
      properties: body.properties ?? undefined,
      clickIds: body.clickIds ?? undefined,
      pageUrl: body.pageUrl ?? null,
    },
  });

  // Fire-and-forget: the visitor's browser shouldn't wait on three outbound
  // ad-platform API calls just to record a page view. Failures are logged
  // back onto the event row instead of surfacing to the caller.
  relayEvent(config, trackingEvent.id, body).catch(() => {});

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

async function relayEvent(
  config: NonNullable<Awaited<ReturnType<typeof prisma.trackingConfig.findUnique>>>,
  eventId: string,
  body: any
) {
  const relayEventPayload = {
    eventName: body.event,
    visitorId: body.visitorId,
    valueCents: body.valueCents,
    currency: body.currency,
    pageUrl: body.pageUrl,
    clickIds: body.clickIds,
  };

  const updates: Record<string, any> = {};
  const errors: string[] = [];

  if (config.metaPixelId && config.metaAccessToken) {
    try {
      await relayToMeta(config.metaPixelId, config.metaAccessToken, relayEventPayload, body.email);
      updates.relayedMeta = true;
    } catch (err: any) {
      errors.push(`meta: ${err.message}`);
    }
  }

  if (config.tiktokPixelId && config.tiktokAccessToken) {
    try {
      await relayToTiktok(config.tiktokPixelId, config.tiktokAccessToken, relayEventPayload, body.email);
      updates.relayedTiktok = true;
    } catch (err: any) {
      errors.push(`tiktok: ${err.message}`);
    }
  }

  if (config.ga4MeasurementId && config.ga4ApiSecret) {
    try {
      await relayToGa4(config.ga4MeasurementId, config.ga4ApiSecret, relayEventPayload);
      updates.relayedGa4 = true;
    } catch (err: any) {
      errors.push(`ga4: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    updates.relayError = errors.join("; ").slice(0, 500);
  }

  if (Object.keys(updates).length > 0) {
    await prisma.trackingEvent.update({ where: { id: eventId }, data: updates });
  }
}
