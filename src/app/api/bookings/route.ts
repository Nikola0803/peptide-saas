import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-public-key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// POST /api/bookings
//
// Accepts booking submissions from connected storefronts (evlvtoday.com,
// the brand hub). Authenticated by x-public-key matching Brand.bookingPublicKey.
//
// Accepts two payload shapes:
//   1. Full CrmBookingPayload from evtd (schemaVersion: "1.0", event: "education_call.requested")
//   2. Simple object from evlv-tiny { name, email, date, time, timezone, purpose, notes? }
//
// Either way, creates a Booking row and upserts a Contact so the person
// shows up in the CRM contacts view.
export async function POST(req: NextRequest) {
  const publicKey = req.headers.get("x-public-key");
  if (!publicKey) {
    return NextResponse.json({ error: "x-public-key header is required." }, { status: 401, headers: CORS_HEADERS });
  }

  const brand = await prisma.brand.findUnique({
    where: { bookingPublicKey: publicKey },
    include: { organization: true },
  });
  if (!brand) {
    return NextResponse.json({ error: "Unknown key." }, { status: 404, headers: CORS_HEADERS });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: CORS_HEADERS });
  }

  // Normalise both payload shapes into a flat booking record.
  let email: string;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let name: string | null = null;
  let phone: string | null = null;
  let kind = "education_intro";
  let channel = "phone";
  let source: string | null = null;
  let requestedDate: string;
  let requestedTime: string;
  let timezone: string;
  let durationMinutes = 15;
  let interests: string[] = [];
  let purpose: string | null = null;
  let notes: string | null = null;
  let privacyAccepted = false;
  let marketingOptIn = false;
  let referrer: string | null = null;

  if (body.schemaVersion === "1.0" && body.event === "education_call.requested") {
    // evtd CrmBookingPayload
    const { contact, booking } = body as {
      contact: { firstName: string; lastName: string; email: string; phone?: string };
      booking: { kind: string; channel: string; requestedDate: string; requestedTime: string; timezone: string; durationMinutes: number };
      interests: string[];
      notes: string | null;
      consent: { privacyAccepted: boolean; marketingOptIn: boolean };
      source: string;
      attribution: { referrer: string | null };
    };
    email = contact.email?.trim().toLowerCase();
    firstName = contact.firstName?.trim() || null;
    lastName = contact.lastName?.trim() || null;
    phone = contact.phone?.trim() || null;
    kind = booking.kind ?? "education_intro";
    channel = booking.channel ?? "phone";
    source = body.source ?? null;
    requestedDate = booking.requestedDate;
    requestedTime = booking.requestedTime;
    timezone = booking.timezone;
    durationMinutes = booking.durationMinutes ?? 15;
    interests = Array.isArray(body.interests) ? body.interests : [];
    notes = body.notes ?? null;
    privacyAccepted = body.consent?.privacyAccepted ?? false;
    marketingOptIn = body.consent?.marketingOptIn ?? false;
    referrer = body.attribution?.referrer ?? null;
  } else {
    // evlv-tiny simple payload: { name, email, date, time, timezone, purpose, notes?, company? }
    email = (body.email ?? "").trim().toLowerCase();
    name = (body.name ?? "").trim() || null;
    channel = body.channel ?? "video";
    source = body.source ?? "evlvtoday-hub";
    requestedDate = body.date ?? "";
    requestedTime = body.time ?? "";
    timezone = body.timezone ?? "Europe/Budapest";
    purpose = body.purpose ?? null;
    notes = body.notes ?? null;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 422, headers: CORS_HEADERS });
  }
  if (!requestedDate || !requestedTime) {
    return NextResponse.json({ error: "requestedDate and requestedTime are required." }, { status: 422, headers: CORS_HEADERS });
  }

  // Upsert contact so they appear in the Contacts page.
  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: brand.organizationId, email } },
    create: {
      organizationId: brand.organizationId,
      email,
      name: name ?? ([firstName, lastName].filter(Boolean).join(" ") || null),
      marketingOptIn,
    },
    update: {
      ...(marketingOptIn ? { marketingOptIn: true } : {}),
      ...(name ? { name } : [firstName, lastName].filter(Boolean).length ? { name: [firstName, lastName].filter(Boolean).join(" ") } : {}),
    },
  });

  // Link contact to this brand if not already.
  await prisma.contactBrandLink.upsert({
    where: { contactId_brandId: { contactId: contact.id, brandId: brand.id } },
    create: { contactId: contact.id, brandId: brand.id },
    update: {},
  });

  const booking = await prisma.booking.create({
    data: {
      organizationId: brand.organizationId,
      brandId: brand.id,
      email,
      firstName,
      lastName,
      phone,
      name,
      kind,
      channel,
      source,
      requestedDate,
      requestedTime,
      timezone,
      durationMinutes,
      interests,
      purpose,
      notes,
      privacyAccepted,
      marketingOptIn,
      referrer,
    },
  });

  return NextResponse.json({ ok: true, bookingId: booking.id }, { headers: CORS_HEADERS });
}
