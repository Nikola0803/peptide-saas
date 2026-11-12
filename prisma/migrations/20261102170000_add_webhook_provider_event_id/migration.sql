ALTER TABLE "WebhookEvent" ADD COLUMN "providerEventId" TEXT;
CREATE UNIQUE INDEX "WebhookEvent_providerEventId_key" ON "WebhookEvent"("providerEventId");
