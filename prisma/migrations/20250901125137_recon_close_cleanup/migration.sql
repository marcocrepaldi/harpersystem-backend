/*
  Warnings:

  - You are about to drop the column `observacaoFechamento` on the `reconciliation_runs` table. All the data in the column will be lost.
  - You are about to drop the column `valorFaturaDeclarado` on the `reconciliation_runs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "harper_app_dev"."reconciliation_runs" DROP COLUMN "observacaoFechamento",
DROP COLUMN "valorFaturaDeclarado";
