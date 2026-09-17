import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { sendTemplate } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ShipStation Custom Store integration for VVGOps (the fulfillment
// partner) -- see https://help.shipstation.com/hc/en-us/articles/360025856192.
// ShipStation polls this one URL periodically with ?action=export to pull
// orders, and (if "send shipping updates" is turned on for this store on
// ShipStation's side) POSTs back to it with ?action=shipnotify once an
// order ships. One URL, one set of Basic Auth credentials -- both handed
// to VVG once, set as env vars here so nothing in this file is a secret.
//
// Auth is HTTP Basic, not the x-store-domain/x-store-api-key header pair
// the rest of this app's storefront proxy uses (see lib/crm-proxy.ts) --
// ShipStation's custom store config only ever sends Basic Auth, it has no
// concept of custom headers.
function checkAuth(req: NextRequest): boolean {
  const user = process.env.SHIPSTATION_USERNAME;
  const pass = process.env.SHIPSTATION_PASSWORD;
  if (!user || !pass) return false;

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep === -1) return false;
  return decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass;
}

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="ShipStation"' } });
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlResponse(body: string): NextResponse {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

// Which Brand this feed pulls from. Single env var rather than a header
// or query param, since VVG's ShipStation account only ever has the one
// URL configured -- if a second brand ever needs its own VVG feed, this
// becomes a query param (?brand=) at that point, not before.
async function resolveBrand() {
  const domain = process.env.SHIPSTATION_BRAND_DOMAIN;
  if (!domain) return null;
  return prisma.brand.findFirst({ where: { domain } });
}

// ShipStation sends start_date/end_date as "MM/dd/yyyy HH:mm" in UTC.
// new Date("09/17/2026 14:30") parses as the SERVER'S LOCAL time, not
// UTC, which silently shifts the export window by the server's UTC
// offset -- so this parses the exact "M/d/yyyy H:mm" shape by hand and
// builds the Date with Date.UTC(...) instead of trusting the Date
// constructor's locale-dependent parsing.
function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const [, month, day, year, hour, minute] = match;
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  return Number.isNaN(d.getTime()) ? fallback : d;
}

// ShipStation's custom-store XML wants OrderDate/LastModified back in the
// same "MM/dd/yyyy HH:mm" UTC format it sends, not ISO8601 -- formatting
// a Date as ISO8601 here (the previous bug) is silently ignored/misread
// by ShipStation's importer.
function formatShipStationDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const PAGE_SIZE = 100;

// Placeholder only -- a small vial + padded mailer, roughly what most of
// this catalog actually weighs, used only until a product's real weightOz
// is set. Every use is logged (see the Weight comment below) so it's a
// stopgap, not a permanent stand-in for the real per-SKU number.
const WEIGHT_FALLBACK_OZ = 2;

async function handleExport(req: NextRequest): Promise<NextResponse> {
  const brand = await resolveBrand();
  if (!brand) {
    return xmlResponse('<?xml version="1.0" encoding="utf-8"?>\n<Orders pages="0"></Orders>');
  }

  const url = new URL(req.url);
  const startDate = parseDate(url.searchParams.get("start_date"), new Date(0));
  const endDate = parseDate(url.searchParams.get("end_date"), new Date());
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  // "Only paid orders" (per VVG's ask) -- ON_HOLD is a storefront order
  // that hasn't had its payment confirmed yet (see confirmPayment in
  // orders/actions.ts), REFUNDED is money given back. Neither should ever
  // reach a fulfillment partner. PROCESSING (paid, not yet shipped) and
  // COMPLETED (already shipped) both go out -- ShipStation needs to see a
  // COMPLETED order too, at least once, to know not to re-flag it as
  // needing a label if VVG's own records get out of sync.
  //
  // ShipStation's poller sends start_date/end_date as a rolling "since
  // last poll" window (every 5 minutes here) and expects this query to
  // return anything MODIFIED in that window -- not anything placed in
  // it. Filtering on placedAt (the previous bug) meant an order dropped
  // out of every future poll's window the moment more than one polling
  // interval had passed since it was placed, even though it was still
  // sitting there unshipped: a clean, empty-looking poll every 5 minutes
  // forever. This now matches on the same "effective last modified"
  // timestamp already used for the <LastModified> field below
  // (paymentConfirmedAt if the order has one, placedAt otherwise).
  const where = {
    brandId: brand.id,
    AND: [
      // PROCESSING (paid) and COMPLETED (shipped) always go out. A
      // REFUNDED order also goes out, but only once and only if it was
      // cancelled before ever shipping (shippedAt null) -- VVG needs the
      // explicit "cancelled" status once so their own copy stops sitting
      // in Awaiting Shipment, but a REFUNDED order that already shipped
      // (a post-fulfillment return) has nothing left for them to act on
      // and shouldn't retroactively look cancelled.
      {
        OR: [
          { status: { in: ["PROCESSING", "COMPLETED"] as OrderStatus[] } },
          { status: "REFUNDED" as OrderStatus, shippedAt: null },
        ],
      },
      {
        OR: [
          { paymentConfirmedAt: { gte: startDate, lte: endDate } },
          { paymentConfirmedAt: null, placedAt: { gte: startDate, lte: endDate } },
        ],
      },
    ],
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { contact: true, items: { include: { product: true } } },
      orderBy: { placedAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const orderXml = orders
    .map((order) => {
      // "Order numbers prefixed EVLV- so they don't mix with my brands" --
      // purely cosmetic for VVG's own multi-brand ShipStation account.
      // Short and human-sayable -- externalOrderNumber (a WooCommerce/
      // plugin id or this app's own long createId()) is what the previous
      // version of this feed sent, and at 40 characters it's neither
      // readable on a packing slip nor something Theresa can read out
      // loud over the phone.
      const orderNumber = `EVLV-${order.orderSeq}`;
      // VVG's Custom Store connection maps ShipStation's 5 default status
      // buckets literally: "unpaid", "paid", "shipped", "cancelled",
      // "on_hold" -- these are the only strings that land anywhere. The
      // export query above only ever admits PROCESSING, COMPLETED, or a
      // REFUNDED-before-shipping order, so this only ever needs to cover
      // those three.
      const orderStatus = order.status === "COMPLETED" ? "shipped" : order.status === "REFUNDED" ? "cancelled" : "paid";
      const customerEmail = order.contact?.email ?? "";
      const customerName = order.shipToName || order.contact?.name || customerEmail || "Customer";
      const totalCents = order.grossCents + order.shippingCents;

      const itemsXml = order.items
        .map((item) => {
          // Fulfillment SKU wins -- VVG's own scheme (RET10, TIR30, ...)
          // set via the "Set VVG fulfillment SKUs" tool, or by hand on the
          // product's own page (see Product.fulfillmentSku). Falls back to
          // this CRM's internal sku (item.sku, snapshotted at order time)
          // for anything never mapped, so nothing ships with a blank SKU.
          const sku = item.product?.fulfillmentSku || item.sku;
          // ShipStation won't rate a shipment or print a label without a
          // weight on every line item -- Weight here is per unit, same as
          // UnitPrice above (ShipStation multiplies by Quantity itself).
          // Falls back to a conservative placeholder for any product that
          // hasn't had its real weight set yet (Product.weightOz) rather
          // than blocking the whole order from reaching VVG, but every
          // fallback use is logged so it gets caught and fixed with the
          // real number instead of silently mis-rating shipments forever.
          const weightOz = item.product?.weightOz ?? WEIGHT_FALLBACK_OZ;
          if (item.product?.weightOz == null) {
            console.warn(`ShipStation export: no weightOz set for product ${item.product?.id ?? "(unmapped)"} (sku ${sku}) -- using ${WEIGHT_FALLBACK_OZ}oz fallback`);
          }
          return `      <Item>
        <SKU>${xmlEscape(sku)}</SKU>
        <Name>${xmlEscape(item.name)}</Name>
        <Quantity>${item.quantity}</Quantity>
        <UnitPrice>${(item.unitPriceCents / 100).toFixed(2)}</UnitPrice>
        <Weight>${weightOz.toFixed(2)}</Weight>
        <WeightUnits>Ounces</WeightUnits>
      </Item>`;
        })
        .join("\n");

      return `  <Order>
    <OrderID>${xmlEscape(order.id)}</OrderID>
    <OrderNumber>${xmlEscape(orderNumber)}</OrderNumber>
    <OrderDate>${formatShipStationDate(order.placedAt)}</OrderDate>
    <OrderStatus>${orderStatus}</OrderStatus>
    <LastModified>${formatShipStationDate(order.paymentConfirmedAt ?? order.placedAt)}</LastModified>
    <OrderTotal>${(totalCents / 100).toFixed(2)}</OrderTotal>
    <ShippingAmount>${(order.shippingCents / 100).toFixed(2)}</ShippingAmount>
    <TaxAmount>0.00</TaxAmount>
    <CustomerNotes></CustomerNotes>
    <Customer>
      <CustomerCode>${xmlEscape(customerEmail || order.id)}</CustomerCode>
      <BillTo>
        <Name>${xmlEscape(customerName)}</Name>
        <Email>${xmlEscape(customerEmail)}</Email>
      </BillTo>
      <ShipTo>
        <Name>${xmlEscape(customerName)}</Name>
        <Address1>${xmlEscape(order.shipToAddress1 ?? "")}</Address1>
        <Address2>${xmlEscape(order.shipToAddress2 ?? "")}</Address2>
        <City>${xmlEscape(order.shipToCity ?? "")}</City>
        <State>${xmlEscape(order.shipToState ?? "")}</State>
        <PostalCode>${xmlEscape(order.shipToPostalCode ?? "")}</PostalCode>
        <Country>${xmlEscape(order.shipToCountry ?? "US")}</Country>
      </ShipTo>
    </Customer>
    <Items>
${itemsXml}
    </Items>
  </Order>`;
    })
    .join("\n");

  return xmlResponse(`<?xml version="1.0" encoding="utf-8"?>\n<Orders pages="${pages}">\n${orderXml}\n</Orders>`);
}

// Fires when VVG marks an order shipped in ShipStation (only if
// ShipStation has "send shipping updates" turned on for this store --
// ask VVG/ShipStation support to enable it, it's off by default for
// custom stores). Sets the exact fields markItemShipped already sets for
// a dropship supplier's own shipment (dropship/actions.ts) -- the
// shipping_confirmation email automation and the CRM's Shipping page
// both key off Order.shippedAt/trackingNumber/carrierCode, not anything
// ShipStation-specific, so this is the one place that needs to know
// ShipStation exists at all.
async function handleShipNotify(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const params = url.searchParams;
  // ShipStation sends this as query params on both GET and POST for
  // shipnotify -- a POST body isn't guaranteed to be JSON (it's normally
  // unused for this action), so query params are the reliable source.
  const rawOrderNumber = params.get("order_number") ?? "";
  const orderNumber = rawOrderNumber.startsWith("EVLV-") ? rawOrderNumber.slice(5) : rawOrderNumber;
  const trackingNumber = params.get("tracking_number") ?? undefined;
  const carrierCode = params.get("carrier") ?? undefined;
  const shipstationOrderId = params.get("order_id") ?? undefined;

  if (!orderNumber) {
    return xmlResponse('<?xml version="1.0" encoding="utf-8"?>\n<Result><Success>false</Success><Message>Missing order_number</Message></Result>');
  }

  const order = await prisma.order.findFirst({ where: { externalOrderNumber: orderNumber } });
  if (!order) {
    return xmlResponse('<?xml version="1.0" encoding="utf-8"?>\n<Result><Success>false</Success><Message>Order not found</Message></Result>');
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "COMPLETED",
      shippedAt: new Date(),
      trackingNumber: trackingNumber || order.trackingNumber,
      carrierCode: carrierCode || order.carrierCode,
      shipstationOrderId: shipstationOrderId || order.shipstationOrderId,
    },
  });
  await prisma.orderItem.updateMany({
    where: { orderId: order.id },
    data: { fulfillmentStatus: "SHIPPED", shippedAt: new Date(), trackingNumber, carrierCode },
  });

  // Best-effort, same pattern as every other order-lifecycle email in
  // this app -- the automation job (automation-job.ts's
  // runShippingConfirmation) also picks this order up on its own next
  // pass since shippedAt is now set, so this isn't the only path to the
  // customer getting notified if it fails here.
  if (order.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: order.contactId } });
    if (contact) {
      sendTemplate(order.organizationId, "shipping_confirmation", contact.email, {
        customerName: contact.name || contact.email,
        orderNumber: order.externalOrderNumber,
        trackingNumber: trackingNumber ?? "",
        carrierCode: carrierCode ?? "",
      }).catch((err) => console.error("Shipping confirmation email failed", err));
    }
  }

  return xmlResponse('<?xml version="1.0" encoding="utf-8"?>\n<Result><Success>true</Success></Result>');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!checkAuth(req)) return unauthorized();
  const action = new URL(req.url).searchParams.get("action");
  if (action === "shipnotify") return handleShipNotify(req);
  return handleExport(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkAuth(req)) return unauthorized();
  const action = new URL(req.url).searchParams.get("action");
  if (action === "shipnotify") return handleShipNotify(req);
  return handleExport(req);
}
