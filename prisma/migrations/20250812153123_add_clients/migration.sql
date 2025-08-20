-- CreateTable
CREATE TABLE "harper_app_dev"."clients" (
    "id" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" VARCHAR(255),
    "document" VARCHAR(32),
    "phone" VARCHAR(32),
    "birthDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_corretorId_email_idx" ON "harper_app_dev"."clients"("corretorId", "email");

-- CreateIndex
CREATE INDEX "clients_corretorId_name_idx" ON "harper_app_dev"."clients"("corretorId", "name");
