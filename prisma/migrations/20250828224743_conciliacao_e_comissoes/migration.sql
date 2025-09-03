-- CreateEnum
CREATE TYPE "harper_app_dev"."ConciliacaoStatus" AS ENUM ('ABERTA', 'FECHADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "harper_app_dev"."ComissaoStatus" AS ENUM ('A_RECEBER', 'RECEBIDA', 'ESTORNADA');

-- CreateTable
CREATE TABLE "harper_app_dev"."reconciliation_runs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mesReferencia" TIMESTAMP(3) NOT NULL,
    "status" "harper_app_dev"."ConciliacaoStatus" NOT NULL DEFAULT 'ABERTA',
    "totals" JSONB,
    "filtros" JSONB,
    "counts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."reconciliation_items" (
    "id" TEXT NOT NULL,
    "conciliacaoId" TEXT NOT NULL,
    "faturaId" TEXT,
    "beneficiarioId" TEXT,
    "cpf" VARCHAR(14),
    "nome" TEXT,
    "valorCobrado" DECIMAL(12,2),
    "valorCadastro" DECIMAL(12,2),
    "diferenca" DECIMAL(12,2),
    "statusLinha" TEXT NOT NULL,
    "plano" TEXT,
    "centroCusto" TEXT,
    "faixaEtaria" TEXT,
    "regimeCobranca" "harper_app_dev"."RegimeCobranca",
    "motivoMovimento" "harper_app_dev"."MotivoMovimento",
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."commission_rules" (
    "id" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "clientId" TEXT,
    "planId" TEXT,
    "faixaEtaria" TEXT,
    "regimeCobranca" "harper_app_dev"."RegimeCobranca",
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "percent" DECIMAL(7,6),
    "valorFixo" DECIMAL(12,2),
    "baseSource" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."commission_accruals" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "conciliacaoId" TEXT NOT NULL,
    "beneficiarioId" TEXT,
    "planId" TEXT,
    "competencia" TIMESTAMP(3) NOT NULL,
    "base" DECIMAL(12,2) NOT NULL,
    "aliquota" DECIMAL(7,6),
    "valor" DECIMAL(12,2) NOT NULL,
    "status" "harper_app_dev"."ComissaoStatus" NOT NULL DEFAULT 'A_RECEBER',
    "dueDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "reference" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_runs_clientId_status_mesReferencia_idx" ON "harper_app_dev"."reconciliation_runs"("clientId", "status", "mesReferencia");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_runs_clientId_mesReferencia_key" ON "harper_app_dev"."reconciliation_runs"("clientId", "mesReferencia");

-- CreateIndex
CREATE INDEX "reconciliation_items_conciliacaoId_statusLinha_idx" ON "harper_app_dev"."reconciliation_items"("conciliacaoId", "statusLinha");

-- CreateIndex
CREATE INDEX "commission_rules_corretorId_clientId_planId_faixaEtaria_vig_idx" ON "harper_app_dev"."commission_rules"("corretorId", "clientId", "planId", "faixaEtaria", "vigenciaInicio", "vigenciaFim");

-- CreateIndex
CREATE INDEX "commission_accruals_clientId_competencia_status_idx" ON "harper_app_dev"."commission_accruals"("clientId", "competencia", "status");

-- CreateIndex
CREATE INDEX "commission_accruals_conciliacaoId_idx" ON "harper_app_dev"."commission_accruals"("conciliacaoId");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."reconciliation_items" ADD CONSTRAINT "reconciliation_items_conciliacaoId_fkey" FOREIGN KEY ("conciliacaoId") REFERENCES "harper_app_dev"."reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."reconciliation_items" ADD CONSTRAINT "reconciliation_items_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "harper_app_dev"."health_imported_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."reconciliation_items" ADD CONSTRAINT "reconciliation_items_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "harper_app_dev"."health_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_rules" ADD CONSTRAINT "commission_rules_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_rules" ADD CONSTRAINT "commission_rules_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_rules" ADD CONSTRAINT "commission_rules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "harper_app_dev"."health_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_accruals" ADD CONSTRAINT "commission_accruals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_accruals" ADD CONSTRAINT "commission_accruals_conciliacaoId_fkey" FOREIGN KEY ("conciliacaoId") REFERENCES "harper_app_dev"."reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_accruals" ADD CONSTRAINT "commission_accruals_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "harper_app_dev"."health_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_accruals" ADD CONSTRAINT "commission_accruals_planId_fkey" FOREIGN KEY ("planId") REFERENCES "harper_app_dev"."health_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
