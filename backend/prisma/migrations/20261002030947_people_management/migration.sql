-- CreateEnum
CREATE TYPE "RewardDisciplineKind" AS ENUM ('REWARD', 'DISCIPLINE');

-- CreateTable
CREATE TABLE "reward_discipline" (
    "id" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "kind" "RewardDisciplineKind" NOT NULL,
    "form" TEXT NOT NULL,
    "decisionNo" TEXT,
    "decisionDate" DATE NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(18,4),
    "expiryDate" DATE,
    "periodElementId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_course" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "location" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "costPerPerson" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "commitmentMonths" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_participant" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'REGISTERED',
    "score" DECIMAL(5,2),
    "certificateNo" TEXT,
    "certificateExpiry" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_cycle" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "goalTemplate" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_review" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "employmentId" UUID NOT NULL,
    "reviewerEmploymentId" UUID,
    "status" TEXT NOT NULL DEFAULT 'SELF',
    "goals" JSONB NOT NULL,
    "selfComment" TEXT,
    "managerComment" TEXT,
    "selfScore" DECIMAL(4,2),
    "finalScore" DECIMAL(4,2),
    "rating" TEXT,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dedupeKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_discipline_periodElementId_key" ON "reward_discipline"("periodElementId");

-- CreateIndex
CREATE INDEX "reward_discipline_employmentId_idx" ON "reward_discipline"("employmentId");

-- CreateIndex
CREATE UNIQUE INDEX "training_course_code_key" ON "training_course"("code");

-- CreateIndex
CREATE UNIQUE INDEX "training_participant_courseId_employmentId_key" ON "training_participant"("courseId", "employmentId");

-- CreateIndex
CREATE INDEX "performance_review_reviewerEmploymentId_idx" ON "performance_review"("reviewerEmploymentId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_review_cycleId_employmentId_key" ON "performance_review"("cycleId", "employmentId");

-- CreateIndex
CREATE INDEX "notification_userId_readAt_idx" ON "notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_userId_dedupeKey_key" ON "notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "reward_discipline" ADD CONSTRAINT "reward_discipline_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_participant" ADD CONSTRAINT "training_participant_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "training_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_participant" ADD CONSTRAINT "training_participant_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review" ADD CONSTRAINT "performance_review_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review" ADD CONSTRAINT "performance_review_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review" ADD CONSTRAINT "performance_review_reviewerEmploymentId_fkey" FOREIGN KEY ("reviewerEmploymentId") REFERENCES "employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
