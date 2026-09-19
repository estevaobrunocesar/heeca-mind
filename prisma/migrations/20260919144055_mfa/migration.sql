-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "mfa_verifications" (
    "sid" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_verifications_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "mfa_verifications_userId_idx" ON "mfa_verifications"("userId");

-- AddForeignKey
ALTER TABLE "mfa_verifications" ADD CONSTRAINT "mfa_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
