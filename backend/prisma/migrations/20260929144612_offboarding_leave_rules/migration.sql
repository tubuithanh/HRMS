-- AlterTable
ALTER TABLE "employment" ADD COLUMN     "terminationNote" TEXT,
ADD COLUMN     "terminationType" TEXT;

-- AlterTable
ALTER TABLE "leave_request" ADD COLUMN     "halfDayPart" TEXT;

-- AlterTable
ALTER TABLE "leave_type" ADD COLUMN     "carryOverMaxDays" DECIMAL(5,1),
ADD COLUMN     "carryOverUntilMonth" INTEGER,
ADD COLUMN     "seniorityBonus" BOOLEAN NOT NULL DEFAULT false;
