-- CreateEnum
CREATE TYPE "harper_app_dev"."RegimeCobranca" AS ENUM ('MENSAL', 'DIARIO');

-- CreateEnum
CREATE TYPE "harper_app_dev"."MotivoMovimento" AS ENUM ('INCLUSAO', 'EXCLUSAO', 'ALTERACAO', 'NENHUM');

-- AlterTable
ALTER TABLE "harper_app_dev"."health_beneficiaries" ADD COLUMN     "motivoMovimento" "harper_app_dev"."MotivoMovimento",
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "regimeCobranca" "harper_app_dev"."RegimeCobranca",
ALTER COLUMN "valorMensalidade" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "harper_app_dev"."health_imported_invoices" ALTER COLUMN "valorCobradoOperadora" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE "harper_app_dev"."health_imported_invoice_items" (
    "id" TEXT NOT NULL,
    "faturaId" TEXT NOT NULL,
    "contrato" TEXT,
    "carteirinha" TEXT,
    "nomeCompleto" TEXT,
    "centroCusto" TEXT,
    "sexo" TEXT,
    "tipo" TEXT,
    "estado" TEXT,
    "cpf" VARCHAR(14),
    "dataNascimento" TIMESTAMP(3),
    "faixaEtaria" TEXT,
    "dataEntrada" TIMESTAMP(3),
    "dataSaida" TIMESTAMP(3),
    "plano" TEXT,
    "valorPlano" DECIMAL(12,2),
    "statusLinha" TEXT,
    "regimeCobranca" "harper_app_dev"."RegimeCobranca",
    "motivoMovimento" "harper_app_dev"."MotivoMovimento",
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_imported_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_imported_invoice_items_faturaId_idx" ON "harper_app_dev"."health_imported_invoice_items"("faturaId");

-- CreateIndex
CREATE INDEX "health_imported_invoice_items_cpf_idx" ON "harper_app_dev"."health_imported_invoice_items"("cpf");

-- CreateIndex
CREATE INDEX "health_imported_invoice_items_carteirinha_idx" ON "harper_app_dev"."health_imported_invoice_items"("carteirinha");

-- CreateIndex
CREATE INDEX "health_imported_invoice_items_contrato_idx" ON "harper_app_dev"."health_imported_invoice_items"("contrato");

-- CreateIndex
CREATE INDEX "health_imported_invoice_items_plano_idx" ON "harper_app_dev"."health_imported_invoice_items"("plano");

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_carteirinha_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "carteirinha");

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_contrato_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "contrato");

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_plano_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "plano");

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_centroCusto_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "centroCusto");

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_dataEntrada_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "dataEntrada");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_imported_invoice_items" ADD CONSTRAINT "health_imported_invoice_items_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "harper_app_dev"."health_imported_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
