-- CreateEnum
CREATE TYPE "ClinicalDocumentKind" AS ENUM ('REPORT', 'REFERRAL', 'DECLARATION', 'CERTIFICATE', 'CONSENT', 'EXAM', 'OTHER');

-- AlterTable
ALTER TABLE "clinical_access_logs" ADD COLUMN     "clinicalDocumentId" TEXT,
ALTER COLUMN "clinicalNoteId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "clinical_documents" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "kind" "ClinicalDocumentKind" NOT NULL DEFAULT 'OTHER',
    "titleEnc" TEXT NOT NULL,
    "descriptionEnc" TEXT,
    "fileNameEnc" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedReason" TEXT,

    CONSTRAINT "clinical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_documents_storageKey_key" ON "clinical_documents"("storageKey");

-- CreateIndex
CREATE INDEX "clinical_documents_patientId_createdAt_idx" ON "clinical_documents"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "clinical_access_logs_clinicalDocumentId_createdAt_idx" ON "clinical_access_logs"("clinicalDocumentId", "createdAt");

-- AddForeignKey
ALTER TABLE "clinical_access_logs" ADD CONSTRAINT "clinical_access_logs_clinicalDocumentId_fkey" FOREIGN KEY ("clinicalDocumentId") REFERENCES "clinical_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

