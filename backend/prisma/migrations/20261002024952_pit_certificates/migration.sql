-- CreateTable
CREATE TABLE "pit_certificate" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "employmentId" UUID NOT NULL,
    "fromMonth" INTEGER NOT NULL,
    "toMonth" INTEGER NOT NULL,
    "taxableIncome" DECIMAL(18,4) NOT NULL,
    "insurance" DECIMAL(18,4) NOT NULL,
    "taxWithheld" DECIMAL(18,4) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pit_certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pit_certificate_year_seq_key" ON "pit_certificate"("year", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "pit_certificate_employmentId_year_fromMonth_toMonth_key" ON "pit_certificate"("employmentId", "year", "fromMonth", "toMonth");

-- AddForeignKey
ALTER TABLE "pit_certificate" ADD CONSTRAINT "pit_certificate_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
