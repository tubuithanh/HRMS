-- CreateEnum
CREATE TYPE "OvertimeType" AS ENUM ('WEEKDAY', 'WEEKEND', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "holiday" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_request" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "hours" DECIMAL(4,1) NOT NULL,
    "otType" "OvertimeType" NOT NULL,
    "isNight" BOOLEAN NOT NULL DEFAULT false,
    "multiplier" DECIMAL(4,2) NOT NULL,
    "reason" TEXT,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holiday_date_key" ON "holiday"("date");

-- CreateIndex
CREATE INDEX "overtime_request_employmentId_idx" ON "overtime_request"("employmentId");

-- CreateIndex
CREATE INDEX "overtime_request_workDate_idx" ON "overtime_request"("workDate");

-- AddForeignKey
ALTER TABLE "overtime_request" ADD CONSTRAINT "overtime_request_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_request" ADD CONSTRAINT "overtime_request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
