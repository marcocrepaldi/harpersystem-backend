-- AlterTable
ALTER TABLE "harper_app_dev"."health_imported_invoice_items" ADD COLUMN     "credencial" VARCHAR(32);

-- CreateIndex
CREATE INDEX "health_imported_invoice_items_credencial_idx" ON "harper_app_dev"."health_imported_invoice_items"("credencial");
