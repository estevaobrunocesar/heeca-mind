-- Heeca Mind, etapa 2: cadastro da clínica (§6), ficha administrativa do paciente (§12) e tags.

ALTER TABLE "organizations"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "instagram" TEXT,
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "logoKey" TEXT,
  ADD COLUMN "addressLine" TEXT,
  ADD COLUMN "addressCity" TEXT,
  ADD COLUMN "addressState" TEXT,
  ADD COLUMN "addressZip" TEXT,
  ADD COLUMN "offersOnline" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "offersInPerson" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "patients"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "birthDate" DATE,
  ADD COLUMN "addressLine" TEXT,
  ADD COLUMN "addressCity" TEXT,
  ADD COLUMN "addressState" TEXT,
  ADD COLUMN "addressZip" TEXT,
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "commsPrefs" JSONB,
  ADD COLUMN "lastCompletedAt" TIMESTAMP(3);

-- Backfill: última sessão concluída de cada paciente.
UPDATE "patients" p SET "lastCompletedAt" = s.last_at
FROM (SELECT "patientId", MAX("startsAt") AS last_at FROM "appointments" WHERE status = 'COMPLETED' GROUP BY "patientId") s
WHERE s."patientId" = p.id;

CREATE INDEX "patients_organizationId_followUpStatus_idx" ON "patients"("organizationId", "followUpStatus");
CREATE INDEX "patients_organizationId_lastCompletedAt_idx" ON "patients"("organizationId", "lastCompletedAt");

CREATE TABLE "tags" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tags_organizationId_name_key" ON "tags"("organizationId", "name");
ALTER TABLE "tags" ADD CONSTRAINT "tags_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "patient_tags" (
  "patientId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_tags_pkey" PRIMARY KEY ("patientId", "tagId")
);
CREATE INDEX "patient_tags_tagId_idx" ON "patient_tags"("tagId");
ALTER TABLE "patient_tags" ADD CONSTRAINT "patient_tags_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_tags" ADD CONSTRAINT "patient_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
