-- CreateEnum
CREATE TYPE "PackagePurchaseStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PACKAGE';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "packagePurchaseId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "packagePurchaseId" TEXT,
ALTER COLUMN "appointmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "professional_policies" ADD COLUMN     "noShowConsumesPackage" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sessionsCount" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "serviceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_purchases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "serviceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PackagePurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_consumptions" (
    "id" TEXT NOT NULL,
    "packagePurchaseId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "revertedAt" TIMESTAMP(3),
    "revertReason" TEXT,

    CONSTRAINT "package_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packages_organizationId_professionalId_isActive_idx" ON "packages"("organizationId", "professionalId", "isActive");

-- CreateIndex
CREATE INDEX "package_purchases_organizationId_patientId_status_idx" ON "package_purchases"("organizationId", "patientId", "status");

-- CreateIndex
CREATE INDEX "package_purchases_expiresAt_idx" ON "package_purchases"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "package_consumptions_appointmentId_key" ON "package_consumptions"("appointmentId");

-- CreateIndex
CREATE INDEX "package_consumptions_packagePurchaseId_revertedAt_idx" ON "package_consumptions"("packagePurchaseId", "revertedAt");

-- CreateIndex
CREATE INDEX "payments_packagePurchaseId_idx" ON "payments"("packagePurchaseId");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_packagePurchaseId_fkey" FOREIGN KEY ("packagePurchaseId") REFERENCES "package_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_packagePurchaseId_fkey" FOREIGN KEY ("packagePurchaseId") REFERENCES "package_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_consumptions" ADD CONSTRAINT "package_consumptions_packagePurchaseId_fkey" FOREIGN KEY ("packagePurchaseId") REFERENCES "package_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_consumptions" ADD CONSTRAINT "package_consumptions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Heeca Mind, etapa 3: um pagamento pertence a exatamente uma origem (sessão ou pacote).
ALTER TABLE "payments" ADD CONSTRAINT "payments_one_origin_chk"
  CHECK (("appointmentId" IS NOT NULL)::int + ("packagePurchaseId" IS NOT NULL)::int = 1);
