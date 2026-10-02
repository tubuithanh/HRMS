-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "orgScope" UUID[] DEFAULT ARRAY[]::UUID[];
