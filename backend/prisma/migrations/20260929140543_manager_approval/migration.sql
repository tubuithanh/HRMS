-- CreateEnum
CREATE TYPE "ApprovalStage" AS ENUM ('MANAGER', 'HR');

-- AlterTable
ALTER TABLE "leave_request" ADD COLUMN     "approvalStage" "ApprovalStage" NOT NULL DEFAULT 'HR',
ADD COLUMN     "approverEmploymentId" UUID,
ADD COLUMN     "managerNote" TEXT,
ADD COLUMN     "managerReviewedAt" TIMESTAMP(3),
ADD COLUMN     "managerReviewedById" UUID;

-- AlterTable
ALTER TABLE "overtime_request" ADD COLUMN     "approvalStage" "ApprovalStage" NOT NULL DEFAULT 'HR',
ADD COLUMN     "approverEmploymentId" UUID,
ADD COLUMN     "managerNote" TEXT,
ADD COLUMN     "managerReviewedAt" TIMESTAMP(3),
ADD COLUMN     "managerReviewedById" UUID;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_approverEmploymentId_fkey" FOREIGN KEY ("approverEmploymentId") REFERENCES "employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_request" ADD CONSTRAINT "overtime_request_approverEmploymentId_fkey" FOREIGN KEY ("approverEmploymentId") REFERENCES "employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
