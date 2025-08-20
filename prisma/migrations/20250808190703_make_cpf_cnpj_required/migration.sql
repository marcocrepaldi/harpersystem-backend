/*
  Warnings:

  - Made the column `cpfCnpj` on table `Corretor` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "harper_app_dev"."Corretor" ALTER COLUMN "cpfCnpj" SET NOT NULL;
