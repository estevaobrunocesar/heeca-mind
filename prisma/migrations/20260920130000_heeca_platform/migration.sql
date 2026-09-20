-- Heeca Mind, etapa 1: espelho da conta/assinatura do portal (provision/entitlement/SSO).

-- CreateEnum
CREATE TYPE "AccessState" AS ENUM ('OK', 'WARNING', 'BLOCKED');

-- AlterTable
ALTER TABLE "organizations"
  ADD COLUMN "heecaSubscriptionId" TEXT,
  ADD COLUMN "heecaAccountId" TEXT,
  ADD COLUMN "planCode" TEXT,
  ADD COLUMN "planFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "planLimits" JSONB,
  ADD COLUMN "accessState" "AccessState" NOT NULL DEFAULT 'OK',
  ADD COLUMN "entitlementSyncedAt" TIMESTAMP(3),
  ADD COLUMN "document" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_heecaSubscriptionId_key" ON "organizations"("heecaSubscriptionId");
