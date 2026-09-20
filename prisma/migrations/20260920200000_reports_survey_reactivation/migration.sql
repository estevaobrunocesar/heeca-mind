-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SURVEY';
ALTER TYPE "NotificationType" ADD VALUE 'REACTIVATION';

-- AlterTable
ALTER TABLE "professional_policies" ADD COLUMN     "reactivationAfterDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "reactivationInviteText" TEXT,
ADD COLUMN     "surveyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "experience_surveys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experience_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactivation_contacts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "notificationId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT NOT NULL,

    CONSTRAINT "reactivation_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "experience_surveys_appointmentId_key" ON "experience_surveys"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "experience_surveys_tokenHash_key" ON "experience_surveys"("tokenHash");

-- CreateIndex
CREATE INDEX "experience_surveys_organizationId_professionalId_answeredAt_idx" ON "experience_surveys"("organizationId", "professionalId", "answeredAt");

-- CreateIndex
CREATE INDEX "reactivation_contacts_organizationId_patientId_sentAt_idx" ON "reactivation_contacts"("organizationId", "patientId", "sentAt");

-- AddForeignKey
ALTER TABLE "experience_surveys" ADD CONSTRAINT "experience_surveys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_surveys" ADD CONSTRAINT "experience_surveys_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_surveys" ADD CONSTRAINT "experience_surveys_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_surveys" ADD CONSTRAINT "experience_surveys_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactivation_contacts" ADD CONSTRAINT "reactivation_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactivation_contacts" ADD CONSTRAINT "reactivation_contacts_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactivation_contacts" ADD CONSTRAINT "reactivation_contacts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

