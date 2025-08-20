/*
  Warnings:

  - A unique constraint covering the columns `[cpfCnpj]` on the table `Corretor` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "harper_app_dev"."Corretor" ADD COLUMN     "cpfCnpj" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Corretor_cpfCnpj_key" ON "harper_app_dev"."Corretor"("cpfCnpj");
