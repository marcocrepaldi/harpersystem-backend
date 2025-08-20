/*
  Warnings:

  - The values [lead,prospect,active,inactive] on the enum `ClientStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to alter the column `email` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- CreateEnum
CREATE TYPE "harper_app_dev"."BeneficiarioTipo" AS ENUM ('TITULAR', 'DEPENDENTE');

-- CreateEnum
CREATE TYPE "harper_app_dev"."BeneficiarioStatus" AS ENUM ('ATIVO', 'INATIVO');

-- AlterEnum
BEGIN;
CREATE TYPE "harper_app_dev"."ClientStatus_new" AS ENUM ('LEAD', 'PROSPECT', 'ACTIVE', 'INACTIVE');
ALTER TABLE "harper_app_dev"."clients" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "harper_app_dev"."clients" ALTER COLUMN "status" TYPE "harper_app_dev"."ClientStatus_new" USING ("status"::text::"harper_app_dev"."ClientStatus_new");
ALTER TYPE "harper_app_dev"."ClientStatus" RENAME TO "ClientStatus_old";
ALTER TYPE "harper_app_dev"."ClientStatus_new" RENAME TO "ClientStatus";
DROP TYPE "harper_app_dev"."ClientStatus_old";
ALTER TABLE "harper_app_dev"."clients" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "harper_app_dev"."User" ALTER COLUMN "email" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "harper_app_dev"."clients" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "harper_app_dev"."health_billing_rules" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "dataCorteCobranca" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_billing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."health_beneficiaries" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "titularId" TEXT,
    "nomeCompleto" TEXT NOT NULL,
    "cpf" VARCHAR(14),
    "tipo" "harper_app_dev"."BeneficiarioTipo" NOT NULL,
    "dataEntrada" TIMESTAMP(3) NOT NULL,
    "dataSaida" TIMESTAMP(3),
    "valorMensalidade" DECIMAL(10,2),
    "status" "harper_app_dev"."BeneficiarioStatus" NOT NULL DEFAULT 'ATIVO',
    "regraCobrancaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."health_imported_invoices" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mesReferencia" TIMESTAMP(3) NOT NULL,
    "nomeBeneficiarioOperadora" TEXT,
    "cpfBeneficiarioOperadora" VARCHAR(14),
    "valorCobradoOperadora" DECIMAL(10,2),
    "statusConciliacao" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_imported_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_billing_rules_clientId_idx" ON "harper_app_dev"."health_billing_rules"("clientId");

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_tipo_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "tipo");

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_status_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "status");

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_titularId_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "titularId");

-- CreateIndex
CREATE UNIQUE INDEX "health_beneficiaries_clientId_cpf_key" ON "harper_app_dev"."health_beneficiaries"("clientId", "cpf");

-- CreateIndex
CREATE INDEX "health_imported_invoices_clientId_mesReferencia_idx" ON "harper_app_dev"."health_imported_invoices"("clientId", "mesReferencia");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "harper_app_dev"."User"("email");

-- CreateIndex
CREATE INDEX "clients_corretorId_document_idx" ON "harper_app_dev"."clients"("corretorId", "document");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_billing_rules" ADD CONSTRAINT "health_billing_rules_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_beneficiaries" ADD CONSTRAINT "health_beneficiaries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_beneficiaries" ADD CONSTRAINT "health_beneficiaries_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "harper_app_dev"."health_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_beneficiaries" ADD CONSTRAINT "health_beneficiaries_regraCobrancaId_fkey" FOREIGN KEY ("regraCobrancaId") REFERENCES "harper_app_dev"."health_billing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_imported_invoices" ADD CONSTRAINT "health_imported_invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
