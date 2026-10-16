-- Deploy before enabling the $15 + $15 customer referral campaign.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_referralCode_key" ON "Contact"("referralCode");

CREATE TABLE IF NOT EXISTS "CustomerReferral" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "referrerContactId" TEXT NOT NULL,
  "friendContactId" TEXT NOT NULL,
  "referredOrderId" TEXT,
  "rewardCouponCode" TEXT,
  "qualifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerReferral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerReferral_friendContactId_key" ON "CustomerReferral"("friendContactId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerReferral_referredOrderId_key" ON "CustomerReferral"("referredOrderId");
CREATE INDEX IF NOT EXISTS "CustomerReferral_organizationId_referrerContactId_idx" ON "CustomerReferral"("organizationId", "referrerContactId");
CREATE INDEX IF NOT EXISTS "CustomerReferral_brandId_createdAt_idx" ON "CustomerReferral"("brandId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CustomerReferral" ADD CONSTRAINT "CustomerReferral_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerReferral" ADD CONSTRAINT "CustomerReferral_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerReferral" ADD CONSTRAINT "CustomerReferral_referrerContactId_fkey" FOREIGN KEY ("referrerContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerReferral" ADD CONSTRAINT "CustomerReferral_friendContactId_fkey" FOREIGN KEY ("friendContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
