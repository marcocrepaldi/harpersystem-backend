-- CreateEnum
CREATE TYPE "harper_app_dev"."RiskProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "harper_app_dev"."RiskProjectCategory" AS ENUM ('RC_GERAL', 'RC_PROFISSIONAL', 'RISCOS_ENGENHARIA', 'EQUIPAMENTOS', 'OBRA');

-- CreateEnum
CREATE TYPE "harper_app_dev"."RiskEquipmentStatus" AS ENUM ('ACTIVE', 'UNDER_MAINTENANCE', 'INACTIVE', 'RETIRED', 'LOST');

-- CreateEnum
CREATE TYPE "harper_app_dev"."RiskEquipmentType" AS ENUM ('MOBILE', 'FIXED');

-- CreateEnum
CREATE TYPE "harper_app_dev"."RiskCertificateStatus" AS ENUM ('PENDING', 'VALID', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "harper_app_dev"."InstallmentStatus" AS ENUM ('OPEN', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "harper_app_dev"."EndorsementType" AS ENUM ('INCREASE', 'DECREASE', 'CANCELLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "harper_app_dev"."CommissionOrigin" AS ENUM ('HEALTH_RECONCILIATION', 'RISK_POLICY_INSTALLMENT', 'RISK_ENDORSEMENT_ADJUST');

-- DropForeignKey
ALTER TABLE "harper_app_dev"."commission_accruals" DROP CONSTRAINT "commission_accruals_conciliacaoId_fkey";

-- AlterTable
ALTER TABLE "harper_app_dev"."commission_accruals" ADD COLUMN     "origin" "harper_app_dev"."CommissionOrigin",
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "policyInstallmentId" TEXT,
ALTER COLUMN "conciliacaoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "harper_app_dev"."policies" ADD COLUMN     "brokerCommissionAmt" DECIMAL(12,2),
ADD COLUMN     "brokerCommissionPct" DECIMAL(7,6),
ADD COLUMN     "commissionBase" DECIMAL(12,2),
ADD COLUMN     "fees" DECIMAL(12,2),
ADD COLUMN     "producerCommissionAmt" DECIMAL(12,2),
ADD COLUMN     "producerCommissionPct" DECIMAL(7,6),
ADD COLUMN     "taxes" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "harper_app_dev"."risk_projects" (
    "id" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" VARCHAR(32),
    "name" TEXT NOT NULL,
    "category" "harper_app_dev"."RiskProjectCategory" NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "harper_app_dev"."RiskProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "totalInsuredValue" DECIMAL(14,2),
    "limitOfLiability" DECIMAL(14,2),
    "deductible" DECIMAL(14,2),
    "currency" TEXT DEFAULT 'BRL',
    "sublimits" JSONB,
    "notes" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "risk_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."risk_project_locations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "zip" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'BR',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_project_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."risk_equipments" (
    "id" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "locationId" TEXT,
    "assetTag" VARCHAR(64),
    "serial" VARCHAR(64),
    "category" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "type" "harper_app_dev"."RiskEquipmentType" NOT NULL DEFAULT 'MOBILE',
    "status" "harper_app_dev"."RiskEquipmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "valueInsured" DECIMAL(14,2),
    "currency" TEXT DEFAULT 'BRL',
    "acquiredAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "lastInspectionAt" TIMESTAMP(3),
    "nextInspectionAt" TIMESTAMP(3),
    "notes" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "risk_equipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."risk_project_policies" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "role" TEXT,
    "notes" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),

    CONSTRAINT "risk_project_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."risk_stakeholders" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" VARCHAR(32),
    "email" CITEXT,
    "phone" VARCHAR(32),
    "notes" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_stakeholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."risk_certificates" (
    "id" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "harper_app_dev"."RiskCertificateStatus" NOT NULL DEFAULT 'PENDING',
    "holderName" TEXT NOT NULL,
    "holderEmail" CITEXT,
    "additionalInsured" BOOLEAN,
    "requirements" JSONB,
    "issuedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."policy_installments" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountGross" DECIMAL(12,2) NOT NULL,
    "amountNet" DECIMAL(12,2),
    "taxes" DECIMAL(12,2),
    "fees" DECIMAL(12,2),
    "status" "harper_app_dev"."InstallmentStatus" NOT NULL DEFAULT 'OPEN',
    "paidAt" TIMESTAMP(3),
    "reference" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."policy_endorsements" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "type" "harper_app_dev"."EndorsementType" NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "amountDelta" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_endorsements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."commission_receipts" (
    "id" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."commission_receipt_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "accrualId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "commission_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_projects_corretorId_clientId_status_idx" ON "harper_app_dev"."risk_projects"("corretorId", "clientId", "status");

-- CreateIndex
CREATE INDEX "risk_projects_corretorId_clientId_category_idx" ON "harper_app_dev"."risk_projects"("corretorId", "clientId", "category");

-- CreateIndex
CREATE INDEX "risk_projects_corretorId_startDate_idx" ON "harper_app_dev"."risk_projects"("corretorId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "risk_projects_corretorId_clientId_code_key" ON "harper_app_dev"."risk_projects"("corretorId", "clientId", "code");

-- CreateIndex
CREATE INDEX "risk_project_locations_projectId_idx" ON "harper_app_dev"."risk_project_locations"("projectId");

-- CreateIndex
CREATE INDEX "risk_equipments_corretorId_clientId_status_idx" ON "harper_app_dev"."risk_equipments"("corretorId", "clientId", "status");

-- CreateIndex
CREATE INDEX "risk_equipments_corretorId_clientId_category_idx" ON "harper_app_dev"."risk_equipments"("corretorId", "clientId", "category");

-- CreateIndex
CREATE INDEX "risk_equipments_projectId_idx" ON "harper_app_dev"."risk_equipments"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_equipments_corretorId_clientId_assetTag_key" ON "harper_app_dev"."risk_equipments"("corretorId", "clientId", "assetTag");

-- CreateIndex
CREATE INDEX "risk_project_policies_policyId_idx" ON "harper_app_dev"."risk_project_policies"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_project_policies_projectId_policyId_key" ON "harper_app_dev"."risk_project_policies"("projectId", "policyId");

-- CreateIndex
CREATE INDEX "risk_stakeholders_projectId_role_idx" ON "harper_app_dev"."risk_stakeholders"("projectId", "role");

-- CreateIndex
CREATE INDEX "risk_certificates_corretorId_clientId_status_idx" ON "harper_app_dev"."risk_certificates"("corretorId", "clientId", "status");

-- CreateIndex
CREATE INDEX "risk_certificates_projectId_status_idx" ON "harper_app_dev"."risk_certificates"("projectId", "status");

-- CreateIndex
CREATE INDEX "policy_installments_policyId_number_idx" ON "harper_app_dev"."policy_installments"("policyId", "number");

-- CreateIndex
CREATE INDEX "policy_installments_dueDate_status_idx" ON "harper_app_dev"."policy_installments"("dueDate", "status");

-- CreateIndex
CREATE INDEX "policy_endorsements_policyId_effectiveAt_idx" ON "harper_app_dev"."policy_endorsements"("policyId", "effectiveAt");

-- CreateIndex
CREATE INDEX "commission_receipts_corretorId_paidAt_idx" ON "harper_app_dev"."commission_receipts"("corretorId", "paidAt");

-- CreateIndex
CREATE INDEX "commission_receipt_items_accrualId_idx" ON "harper_app_dev"."commission_receipt_items"("accrualId");

-- CreateIndex
CREATE UNIQUE INDEX "commission_receipt_items_receiptId_accrualId_key" ON "harper_app_dev"."commission_receipt_items"("receiptId", "accrualId");

-- CreateIndex
CREATE INDEX "commission_accruals_policyId_idx" ON "harper_app_dev"."commission_accruals"("policyId");

-- CreateIndex
CREATE INDEX "commission_accruals_policyInstallmentId_idx" ON "harper_app_dev"."commission_accruals"("policyInstallmentId");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_accruals" ADD CONSTRAINT "commission_accruals_conciliacaoId_fkey" FOREIGN KEY ("conciliacaoId") REFERENCES "harper_app_dev"."reconciliation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_accruals" ADD CONSTRAINT "commission_accruals_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "harper_app_dev"."policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_accruals" ADD CONSTRAINT "commission_accruals_policyInstallmentId_fkey" FOREIGN KEY ("policyInstallmentId") REFERENCES "harper_app_dev"."policy_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_projects" ADD CONSTRAINT "risk_projects_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_projects" ADD CONSTRAINT "risk_projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_project_locations" ADD CONSTRAINT "risk_project_locations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "harper_app_dev"."risk_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_equipments" ADD CONSTRAINT "risk_equipments_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_equipments" ADD CONSTRAINT "risk_equipments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_equipments" ADD CONSTRAINT "risk_equipments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "harper_app_dev"."risk_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_equipments" ADD CONSTRAINT "risk_equipments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "harper_app_dev"."risk_project_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_project_policies" ADD CONSTRAINT "risk_project_policies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "harper_app_dev"."risk_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_project_policies" ADD CONSTRAINT "risk_project_policies_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "harper_app_dev"."policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_stakeholders" ADD CONSTRAINT "risk_stakeholders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "harper_app_dev"."risk_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_certificates" ADD CONSTRAINT "risk_certificates_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_certificates" ADD CONSTRAINT "risk_certificates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."risk_certificates" ADD CONSTRAINT "risk_certificates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "harper_app_dev"."risk_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."policy_installments" ADD CONSTRAINT "policy_installments_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "harper_app_dev"."policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."policy_endorsements" ADD CONSTRAINT "policy_endorsements_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "harper_app_dev"."policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_receipts" ADD CONSTRAINT "commission_receipts_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_receipt_items" ADD CONSTRAINT "commission_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "harper_app_dev"."commission_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."commission_receipt_items" ADD CONSTRAINT "commission_receipt_items_accrualId_fkey" FOREIGN KEY ("accrualId") REFERENCES "harper_app_dev"."commission_accruals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
