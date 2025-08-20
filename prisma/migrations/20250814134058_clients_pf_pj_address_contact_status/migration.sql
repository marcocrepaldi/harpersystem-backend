-- CreateEnum
CREATE TYPE "harper_app_dev"."PersonType" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "harper_app_dev"."ClientStatus" AS ENUM ('lead', 'prospect', 'active', 'inactive');

-- AlterTable
ALTER TABLE "harper_app_dev"."clients" ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "addressCountry" TEXT DEFAULT 'BR',
ADD COLUMN     "addressDistrict" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressState" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "addressZip" TEXT,
ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "personType" "harper_app_dev"."PersonType" NOT NULL DEFAULT 'PF',
ADD COLUMN     "pfIsPEP" BOOLEAN,
ADD COLUMN     "pfMaritalStatus" TEXT,
ADD COLUMN     "pfProfession" TEXT,
ADD COLUMN     "pfRg" TEXT,
ADD COLUMN     "pjCNAE" TEXT,
ADD COLUMN     "pjCnpj" TEXT,
ADD COLUMN     "pjCorporateName" TEXT,
ADD COLUMN     "pjFoundationDate" TIMESTAMP(3),
ADD COLUMN     "pjMunicipalRegistration" TEXT,
ADD COLUMN     "pjRepCpf" TEXT,
ADD COLUMN     "pjRepEmail" TEXT,
ADD COLUMN     "pjRepName" TEXT,
ADD COLUMN     "pjRepPhone" TEXT,
ADD COLUMN     "pjStateRegistration" TEXT,
ADD COLUMN     "pjTradeName" TEXT,
ADD COLUMN     "preferences" JSONB,
ADD COLUMN     "primaryContactEmail" TEXT,
ADD COLUMN     "primaryContactName" TEXT,
ADD COLUMN     "primaryContactNotes" TEXT,
ADD COLUMN     "primaryContactPhone" TEXT,
ADD COLUMN     "primaryContactRole" TEXT,
ADD COLUMN     "privacyConsent" JSONB,
ADD COLUMN     "status" "harper_app_dev"."ClientStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "clients_corretorId_status_idx" ON "harper_app_dev"."clients"("corretorId", "status");

-- CreateIndex
CREATE INDEX "clients_corretorId_createdAt_idx" ON "harper_app_dev"."clients"("corretorId", "createdAt");
