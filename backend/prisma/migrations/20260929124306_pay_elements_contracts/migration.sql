-- CreateEnum
CREATE TYPE "ElementType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('TAXABLE', 'PARTIAL_EXEMPT', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PROBATION', 'FIXED_TERM', 'INDEFINITE', 'SERVICE');

-- AlterTable
ALTER TABLE "payroll_result" ADD COLUMN     "deferredDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "otherDeductions" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "paidDays" DECIMAL(5,1),
ADD COLUMN     "standardDays" INTEGER;

-- CreateTable
CREATE TABLE "pay_element" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ElementType" NOT NULL DEFAULT 'EARNING',
    "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'TAXABLE',
    "taxExemptLimit" DECIMAL(18,4),
    "isInsuranceBase" BOOLEAN NOT NULL DEFAULT false,
    "isProrated" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_element_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_element" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "payElementId" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_element_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_element" (
    "id" UUID NOT NULL,
    "payPeriodId" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "payElementId" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_element_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labor_contract" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "contractNo" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "parentId" UUID,
    "signDate" DATE NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "salaryAmount" DECIMAL(18,4),
    "jobTitle" TEXT,
    "note" TEXT,
    "filePath" TEXT,
    "terminatedDate" DATE,
    "terminateReason" TEXT,
    "isDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labor_contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pay_element_code_key" ON "pay_element"("code");

-- CreateIndex
CREATE INDEX "employee_element_employmentId_idx" ON "employee_element"("employmentId");

-- CreateIndex
CREATE INDEX "period_element_payPeriodId_idx" ON "period_element"("payPeriodId");

-- CreateIndex
CREATE INDEX "period_element_employmentId_idx" ON "period_element"("employmentId");

-- CreateIndex
CREATE UNIQUE INDEX "labor_contract_contractNo_key" ON "labor_contract"("contractNo");

-- CreateIndex
CREATE INDEX "labor_contract_employmentId_idx" ON "labor_contract"("employmentId");

-- CreateIndex
CREATE INDEX "labor_contract_endDate_idx" ON "labor_contract"("endDate");

-- AddForeignKey
ALTER TABLE "employee_element" ADD CONSTRAINT "employee_element_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_element" ADD CONSTRAINT "employee_element_payElementId_fkey" FOREIGN KEY ("payElementId") REFERENCES "pay_element"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_element" ADD CONSTRAINT "period_element_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_element" ADD CONSTRAINT "period_element_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_element" ADD CONSTRAINT "period_element_payElementId_fkey" FOREIGN KEY ("payElementId") REFERENCES "pay_element"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_contract" ADD CONSTRAINT "labor_contract_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_contract" ADD CONSTRAINT "labor_contract_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "labor_contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
