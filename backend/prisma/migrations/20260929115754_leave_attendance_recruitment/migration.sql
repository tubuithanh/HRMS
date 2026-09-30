-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'REMOTE', 'ABSENT', 'LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "OpeningStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "leave_type" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "daysPerYear" DECIMAL(5,1),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_record" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_opening" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "orgStructureId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "status" "OpeningStatus" NOT NULL DEFAULT 'OPEN',
    "openDate" DATE NOT NULL,
    "closeDate" DATE,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_opening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_application" (
    "id" UUID NOT NULL,
    "jobOpeningId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "cvUrl" TEXT,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "interviewAt" TIMESTAMP(3),
    "rating" INTEGER,
    "note" TEXT,
    "hiredPersonId" UUID,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_code_key" ON "leave_type"("code");

-- CreateIndex
CREATE INDEX "leave_request_employmentId_idx" ON "leave_request"("employmentId");

-- CreateIndex
CREATE INDEX "leave_request_status_idx" ON "leave_request"("status");

-- CreateIndex
CREATE INDEX "attendance_record_workDate_idx" ON "attendance_record"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_employmentId_workDate_key" ON "attendance_record"("employmentId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "job_opening_code_key" ON "job_opening"("code");

-- CreateIndex
CREATE INDEX "job_application_jobOpeningId_idx" ON "job_application"("jobOpeningId");

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_opening" ADD CONSTRAINT "job_opening_orgStructureId_fkey" FOREIGN KEY ("orgStructureId") REFERENCES "org_structure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "job_opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_hiredPersonId_fkey" FOREIGN KEY ("hiredPersonId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
