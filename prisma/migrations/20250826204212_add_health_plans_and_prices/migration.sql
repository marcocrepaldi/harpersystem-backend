-- CreateTable
CREATE TABLE "harper_app_dev"."health_plans" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."health_plan_aliases" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "health_plan_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."health_plan_prices" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "faixaEtaria" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "regimeCobranca" "harper_app_dev"."RegimeCobranca",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."client_health_plans" (
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "client_health_plans_pkey" PRIMARY KEY ("clientId","planId")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."client_health_plan_prices" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "faixaEtaria" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "regimeCobranca" "harper_app_dev"."RegimeCobranca",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_health_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "health_plans_slug_key" ON "harper_app_dev"."health_plans"("slug");

-- CreateIndex
CREATE INDEX "health_plans_name_idx" ON "harper_app_dev"."health_plans"("name");

-- CreateIndex
CREATE INDEX "health_plan_aliases_alias_idx" ON "harper_app_dev"."health_plan_aliases"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "health_plan_aliases_planId_alias_key" ON "harper_app_dev"."health_plan_aliases"("planId", "alias");

-- CreateIndex
CREATE INDEX "health_plan_prices_planId_vigenciaInicio_vigenciaFim_idx" ON "harper_app_dev"."health_plan_prices"("planId", "vigenciaInicio", "vigenciaFim");

-- CreateIndex
CREATE INDEX "health_plan_prices_planId_faixaEtaria_idx" ON "harper_app_dev"."health_plan_prices"("planId", "faixaEtaria");

-- CreateIndex
CREATE INDEX "client_health_plans_planId_idx" ON "harper_app_dev"."client_health_plans"("planId");

-- CreateIndex
CREATE INDEX "client_health_plan_prices_clientId_planId_vigenciaInicio_vi_idx" ON "harper_app_dev"."client_health_plan_prices"("clientId", "planId", "vigenciaInicio", "vigenciaFim");

-- CreateIndex
CREATE INDEX "client_health_plan_prices_clientId_planId_faixaEtaria_idx" ON "harper_app_dev"."client_health_plan_prices"("clientId", "planId", "faixaEtaria");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_plan_aliases" ADD CONSTRAINT "health_plan_aliases_planId_fkey" FOREIGN KEY ("planId") REFERENCES "harper_app_dev"."health_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_plan_prices" ADD CONSTRAINT "health_plan_prices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "harper_app_dev"."health_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."client_health_plans" ADD CONSTRAINT "client_health_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."client_health_plans" ADD CONSTRAINT "client_health_plans_planId_fkey" FOREIGN KEY ("planId") REFERENCES "harper_app_dev"."health_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."client_health_plan_prices" ADD CONSTRAINT "client_health_plan_prices_clientId_planId_fkey" FOREIGN KEY ("clientId", "planId") REFERENCES "harper_app_dev"."client_health_plans"("clientId", "planId") ON DELETE CASCADE ON UPDATE CASCADE;
