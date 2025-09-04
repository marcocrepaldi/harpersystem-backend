-- CreateTable
CREATE TABLE "harper_app_dev"."insurer_billing_rules" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "clientId" TEXT,
    "planId" TEXT,
    "faixaEtaria" TEXT,
    "regime" "harper_app_dev"."RegimeCobranca",
    "policy" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurer_billing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insurer_billing_rules_insurerId_clientId_planId_faixaEtaria_idx" ON "harper_app_dev"."insurer_billing_rules"("insurerId", "clientId", "planId", "faixaEtaria", "regime", "isActive", "validFrom", "validTo");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."insurer_billing_rules" ADD CONSTRAINT "insurer_billing_rules_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "harper_app_dev"."insurers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."insurer_billing_rules" ADD CONSTRAINT "insurer_billing_rules_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."insurer_billing_rules" ADD CONSTRAINT "insurer_billing_rules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "harper_app_dev"."health_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
