-- AlterTable
ALTER TABLE "attendance_record" ADD COLUMN     "shiftId" UUID;

-- AlterTable
ALTER TABLE "person" ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "bankBranch" TEXT,
ADD COLUMN     "bankName" TEXT;

-- CreateTable
CREATE TABLE "shift" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignment" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_roster" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "shiftId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_roster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_code_key" ON "shift"("code");

-- CreateIndex
CREATE INDEX "shift_assignment_employmentId_idx" ON "shift_assignment"("employmentId");

-- CreateIndex
CREATE INDEX "shift_roster_workDate_idx" ON "shift_roster"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "shift_roster_employmentId_workDate_key" ON "shift_roster"("employmentId", "workDate");

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment" ADD CONSTRAINT "shift_assignment_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignment" ADD CONSTRAINT "shift_assignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_roster" ADD CONSTRAINT "shift_roster_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_roster" ADD CONSTRAINT "shift_roster_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
