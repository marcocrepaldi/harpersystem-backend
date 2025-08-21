-- AlterTable
ALTER TABLE "harper_app_dev"."health_beneficiaries" ADD COLUMN     "carteirinha" TEXT,
ADD COLUMN     "centroCusto" TEXT,
ADD COLUMN     "dataNascimento" TIMESTAMP(3),
ADD COLUMN     "matricula" TEXT,
ADD COLUMN     "plano" TEXT,
ADD COLUMN     "sexo" VARCHAR(1);

-- CreateIndex
CREATE INDEX "health_beneficiaries_clientId_matricula_idx" ON "harper_app_dev"."health_beneficiaries"("clientId", "matricula");
