-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('COMPANY', 'BLOCK', 'DIVISION', 'DEPARTMENT', 'TEAM');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('VACANT', 'FILLED', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('EMPLOYEE', 'APPRENTICE', 'SEASONAL', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('UPCOMING', 'PROBATION', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AssignmentAction" AS ENUM ('HIRE', 'TRANSFER', 'PROMOTION', 'DEMOTION', 'CONCURRENT', 'INTER_COMPANY', 'TERMINATE');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('GROSS', 'NET');

-- CreateEnum
CREATE TYPE "TaxResidentStatus" AS ENUM ('RESIDENT', 'NON_RESIDENT');

-- CreateEnum
CREATE TYPE "TaxMethod" AS ENUM ('PROGRESSIVE', 'FLAT_10', 'FLAT_20');

-- CreateEnum
CREATE TYPE "WorkPermitType" AS ENUM ('NEW', 'REISSUE', 'EXTEND', 'EXEMPT');

-- CreateEnum
CREATE TYPE "WorkPermitStatus" AS ENUM ('PREPARING', 'SUBMITTED', 'ISSUED', 'EXPIRED');

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxCode" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_structure" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgType" "OrgType" NOT NULL DEFAULT 'DEPARTMENT',
    "parentId" UUID,
    "path" TEXT,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_structure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobFamily" TEXT,
    "isHazardous" BOOLEAN NOT NULL DEFAULT false,
    "maxProbationDays" INTEGER,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "jobId" UUID NOT NULL,
    "orgStructureId" UUID NOT NULL,
    "parentPositionId" UUID,
    "status" "PositionStatus" NOT NULL DEFAULT 'VACANT',
    "isKeyPosition" BOOLEAN NOT NULL DEFAULT false,
    "headcountFte" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "personCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "gender" "Gender",
    "dateOfBirth" DATE,
    "idNo" TEXT,
    "idDateOfIssue" DATE,
    "idPlaceOfIssue" TEXT,
    "idExpiryDate" DATE,
    "personalTaxCode" TEXT,
    "socialInsNo" TEXT,
    "nationality" TEXT,
    "isForeigner" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "phone" TEXT,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "codeEmp" TEXT NOT NULL,
    "codeAttendance" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'EMPLOYEE',
    "dateHire" DATE NOT NULL,
    "dateSeniority" DATE,
    "probationEndDate" DATE,
    "dateTerminate" DATE,
    "previousEmploymentId" UUID,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'PROBATION',
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "orgStructureId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "fte" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "directManagerEmploymentId" UUID,
    "actionType" "AssignmentAction" NOT NULL DEFAULT 'HIRE',
    "actionReason" TEXT,
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependant" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "dependantName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "dependantTaxCode" TEXT,
    "deductionFromMonth" DATE,
    "deductionToMonth" DATE,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "salaryType" "SalaryType" NOT NULL DEFAULT 'GROSS',
    "baseAmount" DECIMAL(18,4) NOT NULL,
    "insuranceSalary" DECIMAL(18,4),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "sourceType" TEXT,
    "sourceId" UUID,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_salary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_profile" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "taxResidentStatus" "TaxResidentStatus" NOT NULL DEFAULT 'RESIDENT',
    "taxMethod" "TaxMethod" NOT NULL DEFAULT 'PROGRESSIVE',
    "hasCommitment08" BOOLEAN NOT NULL DEFAULT false,
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_tax_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_parameter" (
    "id" UUID NOT NULL,
    "paramCode" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "legalDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_bracket" (
    "id" UUID NOT NULL,
    "scheduleCode" TEXT NOT NULL,
    "bracketNo" INTEGER NOT NULL,
    "fromAmount" DECIMAL(18,4) NOT NULL,
    "toAmount" DECIMAL(18,4),
    "rate" DECIMAL(6,4) NOT NULL,
    "quickDeduction" DECIMAL(18,4) NOT NULL,
    "effectiveDate" DATE NOT NULL,

    CONSTRAINT "tax_bracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_rate" (
    "id" UUID NOT NULL,
    "insuranceType" TEXT NOT NULL,
    "employeeCategory" TEXT NOT NULL DEFAULT 'VN',
    "employeeRate" DECIMAL(6,4) NOT NULL,
    "companyRate" DECIMAL(6,4) NOT NULL,
    "capBase" TEXT NOT NULL,
    "capMultiplier" INTEGER NOT NULL,
    "effectiveDate" DATE NOT NULL,

    CONSTRAINT "insurance_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_period" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'REGULAR',
    "dateStart" DATE NOT NULL,
    "dateEnd" DATE NOT NULL,
    "payDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_result" (
    "id" UUID NOT NULL,
    "payPeriodId" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "grossIncome" DECIMAL(18,4) NOT NULL,
    "taxableIncome" DECIMAL(18,4) NOT NULL,
    "insuranceBase" DECIMAL(18,4) NOT NULL,
    "empInsurance" DECIMAL(18,4) NOT NULL,
    "companyInsurance" DECIMAL(18,4) NOT NULL,
    "selfDeduction" DECIMAL(18,4) NOT NULL,
    "dependantCount" INTEGER NOT NULL DEFAULT 0,
    "dependantDeduction" DECIMAL(18,4) NOT NULL,
    "assessableIncome" DECIMAL(18,4) NOT NULL,
    "pitAmount" DECIMAL(18,4) NOT NULL,
    "netPay" DECIMAL(18,4) NOT NULL,
    "snapshotJson" JSONB,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relative" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "relativeName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "gender" "Gender",
    "idNo" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "occupation" TEXT,
    "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_education" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "schoolName" TEXT NOT NULL,
    "major" TEXT,
    "qualification" TEXT,
    "fromDate" DATE,
    "toDate" DATE,
    "graduationYear" INTEGER,
    "grade" TEXT,
    "isHighest" BOOLEAN NOT NULL DEFAULT false,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_certificate" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "certificateName" TEXT NOT NULL,
    "issuedBy" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "filePath" TEXT,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_experience" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "position" TEXT,
    "fromDate" DATE,
    "toDate" DATE,
    "description" TEXT,
    "reasonLeave" TEXT,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_skill" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "skillName" TEXT NOT NULL,
    "level" TEXT,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_document" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNo" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "filePath" TEXT,
    "fileName" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_permit" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "permitNo" TEXT,
    "permitType" "WorkPermitType" NOT NULL DEFAULT 'NEW',
    "positionName" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "issuedBy" TEXT,
    "status" "WorkPermitStatus" NOT NULL DEFAULT 'ISSUED',
    "filePath" TEXT,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_permit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "residence_card" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "cardType" TEXT NOT NULL,
    "cardNo" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "filePath" TEXT,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residence_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "requestDate" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "reason" TEXT,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_schedule" (
    "id" UUID NOT NULL,
    "advanceId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "payPeriodId" UUID,
    "isDeducted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advance_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_code_key" ON "company"("code");

-- CreateIndex
CREATE INDEX "org_structure_parentId_idx" ON "org_structure"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "org_structure_companyId_code_key" ON "org_structure"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "job_code_key" ON "job"("code");

-- CreateIndex
CREATE UNIQUE INDEX "position_code_key" ON "position"("code");

-- CreateIndex
CREATE INDEX "position_orgStructureId_idx" ON "position"("orgStructureId");

-- CreateIndex
CREATE INDEX "position_jobId_idx" ON "position"("jobId");

-- CreateIndex
CREATE INDEX "employment_personId_idx" ON "employment"("personId");

-- CreateIndex
CREATE INDEX "employment_codeAttendance_idx" ON "employment"("codeAttendance");

-- CreateIndex
CREATE UNIQUE INDEX "employment_companyId_codeEmp_key" ON "employment"("companyId", "codeEmp");

-- CreateIndex
CREATE INDEX "assignment_employmentId_idx" ON "assignment"("employmentId");

-- CreateIndex
CREATE INDEX "assignment_positionId_idx" ON "assignment"("positionId");

-- CreateIndex
CREATE INDEX "dependant_personId_idx" ON "dependant"("personId");

-- CreateIndex
CREATE INDEX "employee_salary_employmentId_idx" ON "employee_salary"("employmentId");

-- CreateIndex
CREATE INDEX "employee_tax_profile_employmentId_idx" ON "employee_tax_profile"("employmentId");

-- CreateIndex
CREATE UNIQUE INDEX "legal_parameter_paramCode_effectiveDate_key" ON "legal_parameter"("paramCode", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "tax_bracket_scheduleCode_bracketNo_effectiveDate_key" ON "tax_bracket"("scheduleCode", "bracketNo", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_rate_insuranceType_employeeCategory_effectiveDate_key" ON "insurance_rate"("insuranceType", "employeeCategory", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "pay_period_code_key" ON "pay_period"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_result_payPeriodId_employmentId_key" ON "payroll_result"("payPeriodId", "employmentId");

-- CreateIndex
CREATE INDEX "relative_personId_idx" ON "relative"("personId");

-- CreateIndex
CREATE INDEX "person_education_personId_idx" ON "person_education"("personId");

-- CreateIndex
CREATE INDEX "person_certificate_personId_idx" ON "person_certificate"("personId");

-- CreateIndex
CREATE INDEX "person_experience_personId_idx" ON "person_experience"("personId");

-- CreateIndex
CREATE INDEX "person_skill_personId_idx" ON "person_skill"("personId");

-- CreateIndex
CREATE INDEX "person_document_personId_idx" ON "person_document"("personId");

-- CreateIndex
CREATE INDEX "work_permit_personId_idx" ON "work_permit"("personId");

-- CreateIndex
CREATE INDEX "residence_card_personId_idx" ON "residence_card"("personId");

-- CreateIndex
CREATE INDEX "advance_employmentId_idx" ON "advance"("employmentId");

-- CreateIndex
CREATE INDEX "advance_schedule_advanceId_idx" ON "advance_schedule"("advanceId");

-- AddForeignKey
ALTER TABLE "org_structure" ADD CONSTRAINT "org_structure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_structure" ADD CONSTRAINT "org_structure_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "org_structure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_orgStructureId_fkey" FOREIGN KEY ("orgStructureId") REFERENCES "org_structure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_parentPositionId_fkey" FOREIGN KEY ("parentPositionId") REFERENCES "position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment" ADD CONSTRAINT "employment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment" ADD CONSTRAINT "employment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_orgStructureId_fkey" FOREIGN KEY ("orgStructureId") REFERENCES "org_structure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependant" ADD CONSTRAINT "dependant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary" ADD CONSTRAINT "employee_salary_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_profile" ADD CONSTRAINT "employee_tax_profile_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_result" ADD CONSTRAINT "payroll_result_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_result" ADD CONSTRAINT "payroll_result_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relative" ADD CONSTRAINT "relative_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_education" ADD CONSTRAINT "person_education_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_certificate" ADD CONSTRAINT "person_certificate_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_experience" ADD CONSTRAINT "person_experience_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_skill" ADD CONSTRAINT "person_skill_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_document" ADD CONSTRAINT "person_document_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_permit" ADD CONSTRAINT "work_permit_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residence_card" ADD CONSTRAINT "residence_card_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance" ADD CONSTRAINT "advance_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_schedule" ADD CONSTRAINT "advance_schedule_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "advance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
