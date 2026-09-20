-- CreateEnum
CREATE TYPE "FormKind" AS ENUM ('INTAKE', 'CONSENT', 'QUESTIONNAIRE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FormDataClass" AS ENUM ('CLINICAL', 'ADMINISTRATIVE');

-- CreateEnum
CREATE TYPE "FormRequestStatus" AS ENUM ('PENDING', 'SUBMITTED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FORM_REQUEST';

-- AlterTable
ALTER TABLE "clinical_access_logs" ADD COLUMN     "formRequestId" TEXT;

-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "FormKind" NOT NULL DEFAULT 'CUSTOM',
    "dataClass" "FormDataClass" NOT NULL DEFAULT 'CLINICAL',
    "fields" JSONB NOT NULL,
    "autoSendOnFirstSession" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "templateId" TEXT,
    "createdByUserId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "dataClass" "FormDataClass" NOT NULL,
    "fieldsSnapshot" JSONB NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "FormRequestStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedIp" TEXT,
    "answersEnc" TEXT,
    "answersJson" JSONB,

    CONSTRAINT "form_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_templates_professionalId_isActive_idx" ON "form_templates"("professionalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "form_requests_tokenHash_key" ON "form_requests"("tokenHash");

-- CreateIndex
CREATE INDEX "form_requests_patientId_status_idx" ON "form_requests"("patientId", "status");

-- CreateIndex
CREATE INDEX "form_requests_status_expiresAt_idx" ON "form_requests"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "clinical_access_logs" ADD CONSTRAINT "clinical_access_logs_formRequestId_fkey" FOREIGN KEY ("formRequestId") REFERENCES "form_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requests" ADD CONSTRAINT "form_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requests" ADD CONSTRAINT "form_requests_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requests" ADD CONSTRAINT "form_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requests" ADD CONSTRAINT "form_requests_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requests" ADD CONSTRAINT "form_requests_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "form_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_requests" ADD CONSTRAINT "form_requests_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

