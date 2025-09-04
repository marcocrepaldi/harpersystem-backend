-- CreateEnum
CREATE TYPE "harper_app_dev"."InsuranceLine" AS ENUM ('HEALTH', 'DENTAL', 'LIFE', 'P_AND_C', 'OTHER');

-- AlterTable
ALTER TABLE "harper_app_dev"."health_plans" ADD COLUMN     "insurerId" TEXT;

-- AlterTable
ALTER TABLE "harper_app_dev"."policies" ADD COLUMN     "insurerId" TEXT;

-- CreateTable
CREATE TABLE "harper_app_dev"."insurers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "taxId" VARCHAR(32),
    "ansCode" VARCHAR(16),
    "lines" "harper_app_dev"."InsuranceLine"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "website" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurers_slug_key" ON "harper_app_dev"."insurers"("slug");

-- CreateIndex
CREATE INDEX "insurers_tradeName_idx" ON "harper_app_dev"."insurers"("tradeName");

-- CreateIndex
CREATE INDEX "insurers_legalName_idx" ON "harper_app_dev"."insurers"("legalName");

-- CreateIndex
CREATE INDEX "insurers_taxId_idx" ON "harper_app_dev"."insurers"("taxId");

-- CreateIndex
CREATE INDEX "insurers_ansCode_idx" ON "harper_app_dev"."insurers"("ansCode");

-- CreateIndex
CREATE INDEX "health_plans_insurerId_idx" ON "harper_app_dev"."health_plans"("insurerId");

-- CreateIndex
CREATE INDEX "policies_insurerId_idx" ON "harper_app_dev"."policies"("insurerId");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."policies" ADD CONSTRAINT "policies_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "harper_app_dev"."insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_plans" ADD CONSTRAINT "health_plans_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "harper_app_dev"."insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
