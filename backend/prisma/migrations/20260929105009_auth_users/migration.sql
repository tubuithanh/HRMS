-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'HR', 'ACCOUNTANT', 'EMPLOYEE');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "personId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_personId_key" ON "app_user"("personId");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
