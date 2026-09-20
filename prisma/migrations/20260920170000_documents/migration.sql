-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CONSENT', 'CONTRACT', 'POLICY', 'AUTHORIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VIEWED', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'PRO_DOCUMENT_ACCEPTED';

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'CONSENT',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requireBeforeFirstSession" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "acceptName" TEXT,
    "acceptIp" TEXT,
    "acceptUserAgent" TEXT,
    "acceptanceHash" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_templates_professionalId_isActive_idx" ON "document_templates"("professionalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "document_requests_tokenHash_key" ON "document_requests"("tokenHash");

-- CreateIndex
CREATE INDEX "document_requests_organizationId_patientId_status_idx" ON "document_requests"("organizationId", "patientId", "status");

-- CreateIndex
CREATE INDEX "document_requests_templateId_patientId_status_idx" ON "document_requests"("templateId", "patientId", "status");

-- CreateIndex
CREATE INDEX "document_requests_status_expiresAt_idx" ON "document_requests"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

