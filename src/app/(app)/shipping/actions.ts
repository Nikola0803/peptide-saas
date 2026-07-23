"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  pushOrderToShipStation,
  listRecentShipments,
  verifyShipStationCredentials,
} from "@/lib/shipstation";

export async function saveShipStationConfig(formData: FormData) {
  const { organization } = await requireOrg();

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const apiSecret = String(formData.get("apiSecret") ?? "").trim();
  const autoPush = formData.get("autoPush") === "on";

  if (!apiKey || !apiSecret) {
    throw new Error("API key and secret are both required");
  }

  await verifyShipStationCredentials(apiKey, apiSecret);

  await prisma.shipStationConfig.upsert({
    where: { organizationId: organization.id },
    update: { apiKey, apiSecret, autoPush },
    create: { organizationId: organization.id, apiKey, apiSecret, autoPush },
  });

  revalidatePath("/shipping");
}

export async function disconnectShipStation() {
  const { organization } = await requireOrg();
  await prisma.shipStationConfig.deleteMany({ where: { organizationId: organization.id } });
  revalidatePath("/shipping");
}

/** Pushes a single order (button on each row of the "awaiting shipment" table). */
export async function pushOrder(orderId: string) {
  const { organization } = await requireOrg();

  const config = await prisma.shipStationConfig.findUnique({ where: { organizationId: organization.id } });
  if (!config) throw new Error("Connect ShipStation first");

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId: organization.id },
    include: { items: true, contact: true, brand: true },
  });
  if (!order) throw new Error("Order not found");

  const result = await pushOrderToShipStation(config.apiKey, config.apiSecret, {
    orderNumber: `${order.brand.slug}-${order.externalOrderNumber}`,
    orderDate: order.placedAt.toISOString(),
    orderStatus: "awaiting_shipment",
    billToEmail: order.contact?.email,
    shipTo: {
      name: order.shipToName ?? undefined,
      street1: order.shipToAddress1 ?? undefined,
      street2: order.shipToAddress2 ?? undefined,
      city: order.shipToCity ?? undefined,
      state: order.shipToState ?? undefined,
      postalCode: order.shipToPostalCode ?? undefined,
      country: order.shipToCountry ?? undefined,
    },
    amountPaid: order.grossCents / 100,
    items: order.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPriceCents / 100,
    })),
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { shipstationOrderId: String(result.orderId) },
  });

  revalidatePath("/shipping");
}

/** "Sync all unshipped orders" bulk button. */
export async function pushAllUnshippedOrders() {
  const { organization } = await requireOrg();

  const config = await prisma.shipStationConfig.findUnique({ where: { organizationId: organization.id } });
  if (!config) throw new Error("Connect ShipStation first");

  const orders = await prisma.order.findMany({
    where: {
      organizationId: organization.id,
      shipstationOrderId: null,
      status: { in: ["COMPLETED", "PROCESSING"] },
    },
    include: { items: true, contact: true, brand: true },
    take: 100,
  });

  for (const order of orders) {
    try {
      const result = await pushOrderToShipStation(config.apiKey, config.apiSecret, {
        orderNumber: `${order.brand.slug}-${order.externalOrderNumber}`,
        orderDate: order.placedAt.toISOString(),
        orderStatus: "awaiting_shipment",
        billToEmail: order.contact?.email,
        shipTo: {
          name: order.shipToName ?? undefined,
          street1: order.shipToAddress1 ?? undefined,
          street2: order.shipToAddress2 ?? undefined,
          city: order.shipToCity ?? undefined,
          state: order.shipToState ?? undefined,
          postalCode: order.shipToPostalCode ?? undefined,
          country: order.shipToCountry ?? undefined,
        },
        amountPaid: order.grossCents / 100,
        items: order.items.map((i) => ({
          sku: i.sku,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPriceCents / 100,
        })),
      });
      await prisma.order.update({ where: { id: order.id }, data: { shipstationOrderId: String(result.orderId) } });
    } catch {
      // Keep going — one bad order (e.g. missing SKU) shouldn't block the rest.
      continue;
    }
  }

  await prisma.shipStationConfig.update({ where: { organizationId: organization.id }, data: { lastSyncedAt: new Date() } });
  revalidatePath("/shipping");
}

/** Pulls tracking numbers for orders ShipStation has since shipped. */
export async function refreshShipmentStatus() {
  const { organization } = await requireOrg();

  const config = await prisma.shipStationConfig.findUnique({ where: { organizationId: organization.id } });
  if (!config) throw new Error("Connect ShipStation first");

  const shipments = await listRecentShipments(config.apiKey, config.apiSecret);
  const brands = await prisma.brand.findMany({ where: { organizationId: organization.id } });

  for (const shipment of shipments) {
    // orderNumber was pushed as "<brand-slug>-<externalOrderNumber>" — split it back apart.
    const brand = brands.find((b) => shipment.orderNumber.startsWith(`${b.slug}-`));
    if (!brand) continue;
    const externalOrderNumber = shipment.orderNumber.slice(brand.slug.length + 1);

    await prisma.order.updateMany({
      where: { brandId: brand.id, externalOrderNumber },
      data: {
        trackingNumber: shipment.trackingNumber,
        carrierCode: shipment.carrierCode,
        shippedAt: shipment.shipDate ? new Date(shipment.shipDate) : new Date(),
      },
    });
  }

  await prisma.shipStationConfig.update({ where: { organizationId: organization.id }, data: { lastSyncedAt: new Date() } });
  revalidatePath("/shipping");
}
