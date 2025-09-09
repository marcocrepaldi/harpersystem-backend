/*
  Warnings:

  - Made the column `createdAt` on table `ImportRun` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `ImportRun` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "harper_app_dev"."ImportRun" ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;
