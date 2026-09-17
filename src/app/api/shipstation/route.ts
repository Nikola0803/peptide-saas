import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

// ShipStation sends "MM/dd/yyyy HH:mm" (server's local time, not UTC) --
// new Date() parses that fine in practice for the "M/d/yyyy H:mm" shape
// it actually sends, so no manual parsing needed.
function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

const PAGE_SIZE = 100;

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
  const where = {
    brandId: brand.id,
    status: { in: ["PROCESSING", "COMPLETED"] as const },
    placedAt: { gte: startDate, lte: endDate },
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
      // externalOrderNumber is already unique on its own (createId()-based,
      // see order-engine.ts), this is purely cosmetic for VVG's own
      // multi-brand ShipStation account.
      const orderNumber = `EVLV-${order.externalOrderNumber}`;
      const orderStatus = order.status === "COMPLETED" ? "shipped" : "awaiting_shipment";
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
          return `      <Item>
        <SKU>${xmlEscape(sku)}</SKU>
        <Name>${xmlEscape(item.name)}</Name>
        <Quantity>${item.quantity}</Quantity>
        <UnitPrice>${(item.unitPriceCents / 100).toFixed(2)}</UnitPrice>
      </Item>`;
        })
        .join("\n");

      return `  <Order>
    <OrderID>${xmlEscape(order.id)}</OrderID>
    <OrderNumber>${xmlEscape(orderNumber)}</OrderNumber>
    <OrderDate>${order.placedAt.toISOString()}</OrderDate>
    <OrderStatus>${orderStatus}</OrderStatus>
    <LastModified>${(order.paymentConfirmedAt ?? order.placedAt).toISOString()}</LastModified>
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
