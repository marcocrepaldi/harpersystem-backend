-- CreateTable
CREATE TABLE "harper_app_dev"."health_beneficiary_import_errors" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "linha" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_beneficiary_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_beneficiary_import_errors_clientId_createdAt_idx" ON "harper_app_dev"."health_beneficiary_import_errors"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."health_beneficiary_import_errors" ADD CONSTRAINT "health_beneficiary_import_errors_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
