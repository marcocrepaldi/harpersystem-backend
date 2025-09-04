/*
  Warnings:

  - A unique constraint covering the columns `[clientId,mesReferencia,insurerId]` on the table `reconciliation_runs` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "harper_app_dev"."reconciliation_runs_clientId_mesReferencia_key";

-- AlterTable
ALTER TABLE "harper_app_dev"."health_imported_invoices" ADD COLUMN     "insurerId" TEXT;

-- AlterTable
ALTER TABLE "harper_app_dev"."reconciliation_runs" ADD COLUMN     "insurerId" TEXT;

-- CreateIndex
CREATE INDEX "health_imported_invoices_insurerId_idx" ON "harper_app_dev"."health_imported_invoices"("insurerId");

-- CreateIndex
CREATE INDEX "health_imported_invoices_clientId_mesReferencia_insurerId_idx" ON "harper_app_dev"."health_imported_invoices"("clientId", "mesReferencia", "insurerId");

-- CreateIndex
CREATE INDEX "reconciliation_runs_clientId_mesReferencia_idx" ON "harper_app_dev"."reconciliation_runs"("clientId", "mesReferencia");

-- CreateIndex
CREATE INDEX "reconciliation_runs_insurerId_idx" ON "harper_app_dev"."reconciliation_runs"("insurerId");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_runs_clientId_mesReferencia_insurerId_key" ON "harper_app_dev"."reconciliation_runs"("clientId", "mesReferencia", "insurerId");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_imported_invoices" ADD CONSTRAINT "health_imported_invoices_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "harper_app_dev"."insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "harper_app_dev"."insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
