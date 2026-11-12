-- CreateTable
CREATE TABLE "MembershipBrandAccess" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipBrandAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipBrandAccess_membershipId_idx" ON "MembershipBrandAccess"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipBrandAccess_membershipId_brandId_key" ON "MembershipBrandAccess"("membershipId", "brandId");

-- AddForeignKey
ALTER TABLE "MembershipBrandAccess" ADD CONSTRAINT "MembershipBrandAccess_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBrandAccess" ADD CONSTRAINT "MembershipBrandAccess_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
