-- CreateTable
CREATE TABLE "insurance_claim" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "regime" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "days" DECIMAL(6,1) NOT NULL,
    "months" DECIMAL(4,1),
    "baseAmount" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "lumpSum" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "childCount" INTEGER,
    "childBirthDate" DATE,
    "detail" JSONB,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "leaveRequestId" UUID,
    "periodElementId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_checklist" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_task" (
    "id" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" DATE,
    "doneAt" TIMESTAMP(3),
    "doneById" UUID,
    "note" TEXT,
    "refType" TEXT,
    "refId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serialNo" TEXT,
    "purchaseDate" DATE,
    "cost" DECIMAL(18,4),
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignment" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "assignedAt" DATE NOT NULL,
    "returnedAt" DATE,
    "conditionOut" TEXT,
    "conditionIn" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claim_leaveRequestId_key" ON "insurance_claim"("leaveRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claim_periodElementId_key" ON "insurance_claim"("periodElementId");

-- CreateIndex
CREATE INDEX "insurance_claim_employmentId_idx" ON "insurance_claim"("employmentId");

-- CreateIndex
CREATE INDEX "employee_checklist_employmentId_idx" ON "employee_checklist"("employmentId");

-- CreateIndex
CREATE INDEX "checklist_task_checklistId_idx" ON "checklist_task"("checklistId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_code_key" ON "asset"("code");

-- CreateIndex
CREATE INDEX "asset_assignment_employmentId_idx" ON "asset_assignment"("employmentId");

-- CreateIndex
CREATE INDEX "asset_assignment_assetId_idx" ON "asset_assignment"("assetId");

-- AddForeignKey
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_checklist" ADD CONSTRAINT "employee_checklist_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_task" ADD CONSTRAINT "checklist_task_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "employee_checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignment" ADD CONSTRAINT "asset_assignment_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
