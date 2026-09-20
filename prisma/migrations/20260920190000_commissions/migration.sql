-- CreateEnum
CREATE TYPE "CommissionEntryKind" AS ENUM ('PAYMENT', 'REVERSAL', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceId" TEXT,
    "percentBp" INTEGER,
    "fixedCents" INTEGER,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "kind" "CommissionEntryKind" NOT NULL DEFAULT 'PAYMENT',
    "paymentId" TEXT,
    "appointmentId" TEXT,
    "packagePurchaseId" TEXT,
    "ruleId" TEXT,
    "baseCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "closingId" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_closings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "entriesCount" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "commission_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_rules_organizationId_professionalId_validFrom_idx" ON "commission_rules"("organizationId", "professionalId", "validFrom");

-- CreateIndex
CREATE INDEX "commission_entries_organizationId_professionalId_occurredAt_idx" ON "commission_entries"("organizationId", "professionalId", "occurredAt");

-- CreateIndex
CREATE INDEX "commission_entries_paymentId_idx" ON "commission_entries"("paymentId");

-- CreateIndex
CREATE INDEX "commission_entries_closingId_idx" ON "commission_entries"("closingId");

-- CreateIndex
CREATE INDEX "commission_closings_organizationId_professionalId_periodEnd_idx" ON "commission_closings"("organizationId", "professionalId", "periodEnd");

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "commission_closings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_closings" ADD CONSTRAINT "commission_closings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_closings" ADD CONSTRAINT "commission_closings_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

