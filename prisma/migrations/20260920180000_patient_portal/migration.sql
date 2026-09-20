-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PORTAL_LOGIN';

-- CreateTable
CREATE TABLE "patient_access_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_access_tokens_tokenHash_key" ON "patient_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "patient_access_tokens_patientId_expiresAt_idx" ON "patient_access_tokens"("patientId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "patient_sessions_sid_key" ON "patient_sessions"("sid");

-- CreateIndex
CREATE INDEX "patient_sessions_patientId_revokedAt_idx" ON "patient_sessions"("patientId", "revokedAt");

-- CreateIndex
CREATE INDEX "patient_sessions_expiresAt_idx" ON "patient_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "patient_access_tokens" ADD CONSTRAINT "patient_access_tokens_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_sessions" ADD CONSTRAINT "patient_sessions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

