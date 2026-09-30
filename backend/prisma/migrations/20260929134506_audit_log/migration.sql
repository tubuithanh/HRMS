-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,
    "userId" UUID,
    "username" TEXT,
    "ip" TEXT,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "summary" TEXT,
    "status" INTEGER,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- CreateIndex
CREATE INDEX "audit_log_requestId_idx" ON "audit_log"("requestId");
