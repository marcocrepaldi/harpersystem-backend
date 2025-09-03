-- AlterTable
ALTER TABLE "harper_app_dev"."reconciliation_runs" ADD COLUMN     "observacaoFechamento" TEXT,
ADD COLUMN     "valorFaturaDeclarado" DECIMAL(12,2);
