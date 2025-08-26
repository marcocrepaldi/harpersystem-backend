/*
  Warnings:

  - The values [DEPENDENTE] on the enum `BeneficiarioTipo` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "harper_app_dev"."BeneficiarioTipo_new" AS ENUM ('TITULAR', 'FILHO', 'CONJUGE');
ALTER TABLE "harper_app_dev"."health_beneficiaries" ALTER COLUMN "tipo" TYPE "harper_app_dev"."BeneficiarioTipo_new" USING ("tipo"::text::"harper_app_dev"."BeneficiarioTipo_new");
ALTER TYPE "harper_app_dev"."BeneficiarioTipo" RENAME TO "BeneficiarioTipo_old";
ALTER TYPE "harper_app_dev"."BeneficiarioTipo_new" RENAME TO "BeneficiarioTipo";
DROP TYPE "harper_app_dev"."BeneficiarioTipo_old";
COMMIT;
