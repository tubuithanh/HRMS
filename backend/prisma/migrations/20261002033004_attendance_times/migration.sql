-- AlterTable
ALTER TABLE "attendance_record" ADD COLUMN     "checkInIp" TEXT,
ADD COLUMN     "checkInLat" DECIMAL(9,6),
ADD COLUMN     "checkInLng" DECIMAL(9,6),
ADD COLUMN     "earlyMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lateMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nightMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workedMinutes" INTEGER;
