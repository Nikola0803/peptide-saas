import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pushCustomEventToOmnisend } from "@/lib/omnisend";

export async function enqueueOmnisendEvent(input: {
  organizationId: string;
  eventName: string;
  email: string;
  properties: Prisma.InputJsonValue;
}) {
  return prisma.omnisendEventQueue.create({ data: input });
}

export async function drainOmnisendEventQueue(limit = 100) {
  const pending = await prisma.omnisendEventQueue.findMany({
    where: { processedAt: null, attempts: { lt: 5 } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const item of pending) {
    const ok = await pushCustomEventToOmnisend({
      eventName: item.eventName,
      email: item.email,
      properties: item.properties as Record<string, string | number | boolean | null>,
    });
    await prisma.omnisendEventQueue.update({
      where: { id: item.id },
      data: ok
        ? { processedAt: new Date(), attempts: { increment: 1 }, lastError: null }
        : { attempts: { increment: 1 }, lastError: "Omnisend rejected or could not receive the event" },
    });
    if (ok) sent += 1;
  }
  return { checked: pending.length, sent };
}
