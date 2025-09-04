/*
  Warnings:

  - You are about to drop the column `brokerCommissionAmt` on the `policies` table. All the data in the column will be lost.
  - You are about to drop the column `brokerCommissionPct` on the `policies` table. All the data in the column will be lost.
  - You are about to drop the column `commissionBase` on the `policies` table. All the data in the column will be lost.
  - You are about to drop the column `fees` on the `policies` table. All the data in the column will be lost.
  - You are about to drop the column `producerCommissionAmt` on the `policies` table. All the data in the column will be lost.
  - You are about to drop the column `producerCommissionPct` on the `policies` table. All the data in the column will be lost.
  - You are about to drop the column `taxes` on the `policies` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "harper_app_dev"."policies" DROP COLUMN "brokerCommissionAmt",
DROP COLUMN "brokerCommissionPct",
DROP COLUMN "commissionBase",
DROP COLUMN "fees",
DROP COLUMN "producerCommissionAmt",
DROP COLUMN "producerCommissionPct",
DROP COLUMN "taxes";
