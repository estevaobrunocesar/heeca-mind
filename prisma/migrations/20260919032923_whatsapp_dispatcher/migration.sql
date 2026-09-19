-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "schedule_settings" ADD COLUMN     "confirmationTimeoutHours" INTEGER NOT NULL DEFAULT 24;
