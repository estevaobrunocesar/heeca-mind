-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PRO_BOOKING_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PRO_BOOKING_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'PRO_BOOKING_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'PRO_RESCHEDULE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PRO_FORM_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'PRO_WAITLIST_JOINED';
ALTER TYPE "NotificationType" ADD VALUE 'PRO_WAITLIST_OFFER_ANSWERED';
ALTER TYPE "NotificationType" ADD VALUE 'PRO_DELEGATION_RECEIVED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailNotifications" JSONB;

