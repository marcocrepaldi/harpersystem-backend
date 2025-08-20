-- CreateEnum
CREATE TYPE "harper_app_dev"."PolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'LAPSED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "harper_app_dev"."policies" (
    "id" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "product" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "premium" DECIMAL(12,2) NOT NULL,
    "status" "harper_app_dev"."PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policies_corretorId_clientId_idx" ON "harper_app_dev"."policies"("corretorId", "clientId");

-- CreateIndex
CREATE INDEX "policies_corretorId_status_idx" ON "harper_app_dev"."policies"("corretorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "policies_corretorId_policyNumber_key" ON "harper_app_dev"."policies"("corretorId", "policyNumber");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."clients" ADD CONSTRAINT "clients_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."policies" ADD CONSTRAINT "policies_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
