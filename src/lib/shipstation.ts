const SHIPSTATION_BASE = "https://ssapi.shipstation.com";

function authHeader(apiKey: string, apiSecret: string) {
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

export type ShipStationOrderItem = {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

/**
 * Pushes a single order into ShipStation via createorder — safe to call
 * repeatedly for the same order (ShipStation upserts on orderNumber +
 * orderKey), which is what lets both the live webhook and a manual
 * "resync" button call this without creating duplicates.
 */
export type ShipStationShipTo = {
  name?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export async function pushOrderToShipStation(
  apiKey: string,
  apiSecret: string,
  order: {
    orderNumber: string;
    orderDate: string; // ISO
    orderStatus: "awaiting_shipment" | "shipped" | "on_hold" | "cancelled";
    billToEmail?: string;
    shipTo?: ShipStationShipTo;
    items: ShipStationOrderItem[];
    amountPaid: number;
  }
): Promise<{ orderId: number; orderKey: string }> {
  const res = await fetch(`${SHIPSTATION_BASE}/orders/createorder`, {
    method: "POST",
    headers: {
      Authorization: authHeader(apiKey, apiSecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      orderStatus: order.orderStatus,
      billTo: order.billToEmail ? { email: order.billToEmail } : undefined,
      shipTo: order.shipTo?.street1
        ? {
            name: order.shipTo.name,
            street1: order.shipTo.street1,
            street2: order.shipTo.street2,
            city: order.shipTo.city,
            state: order.shipTo.state,
            postalCode: order.shipTo.postalCode,
            country: order.shipTo.country || "US",
          }
        : undefined,
      amountPaid: order.amountPaid,
      items: order.items.map((i) => ({
        sku: i.sku,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    }),
  });

  if (!res.ok) {
    throw new Error(`ShipStation createorder ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

/**
 * Pulls recent shipments (i.e. orders ShipStation has already generated a
 * label/tracking number for) so the Shipping page can show tracking status
 * without the operator having to log into ShipStation separately.
 */
export async function listRecentShipments(apiKey: string, apiSecret: string, days = 30) {
  const createDateStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const res = await fetch(
    `${SHIPSTATION_BASE}/shipments?createDateStart=${createDateStart}&pageSize=100&sortBy=CreateDate&sortDir=DESC`,
    { headers: { Authorization: authHeader(apiKey, apiSecret) } }
  );

  if (!res.ok) {
    throw new Error(`ShipStation shipments ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return (data.shipments ?? []) as {
    orderNumber: string;
    trackingNumber: string;
    carrierCode: string;
    shipDate: string;
    shipmentCost: number;
  }[];
}

/** Simple credential check used by the "Save & test" button on the Shipping page. */
export async function verifyShipStationCredentials(apiKey: string, apiSecret: string): Promise<void> {
  const res = await fetch(`${SHIPSTATION_BASE}/accounts/listtags`, {
    headers: { Authorization: authHeader(apiKey, apiSecret) },
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "Invalid API key/secret" : `ShipStation error ${res.status}`);
  }
}
