/*
  Warnings:

  - A unique constraint covering the columns `[tenantCode]` on the table `Corretor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[corretorId,email]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[corretorId,id]` on the table `clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[corretorId,email]` on the table `clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[corretorId,document]` on the table `clients` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "harper_app_dev"."policies" DROP CONSTRAINT "policies_clientId_fkey";

-- DropIndex
DROP INDEX "harper_app_dev"."User_email_key";

-- AlterTable
ALTER TABLE "harper_app_dev"."Corretor" ADD COLUMN     "tenantCode" VARCHAR(16);

-- CreateIndex
CREATE UNIQUE INDEX "Corretor_tenantCode_key" ON "harper_app_dev"."Corretor"("tenantCode");

-- CreateIndex
CREATE INDEX "User_refreshTokenHash_idx" ON "harper_app_dev"."User"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "User_corretorId_email_key" ON "harper_app_dev"."User"("corretorId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_corretorId_id_key" ON "harper_app_dev"."clients"("corretorId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_corretorId_email_key" ON "harper_app_dev"."clients"("corretorId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_corretorId_document_key" ON "harper_app_dev"."clients"("corretorId", "document");

-- CreateIndex
CREATE INDEX "policies_corretorId_startDate_idx" ON "harper_app_dev"."policies"("corretorId", "startDate");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."policies" ADD CONSTRAINT "policies_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."policies" ADD CONSTRAINT "policies_corretorId_clientId_fkey" FOREIGN KEY ("corretorId", "clientId") REFERENCES "harper_app_dev"."clients"("corretorId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
