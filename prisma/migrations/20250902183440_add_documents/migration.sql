-- CreateEnum
CREATE TYPE "harper_app_dev"."DocumentCategory" AS ENUM ('APOLICE', 'PROPOSTA', 'CONTRATO', 'FATURA', 'ANEXO', 'ADITIVO', 'BOLETIMDEOCORRENCIA', 'AVISODESINISTRO', 'LAUDODEPERICIA', 'COMUNICADODEACIDENTE', 'COMPROVANTEDERESIDENCIA', 'RELATORIODEREGULACAO', 'DOCUMENTO', 'OUTRO');

-- CreateTable
CREATE TABLE "harper_app_dev"."documents" (
    "id" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "policyId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "category" "harper_app_dev"."DocumentCategory" NOT NULL DEFAULT 'ANEXO',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_storageKey_key" ON "harper_app_dev"."documents"("storageKey");

-- CreateIndex
CREATE INDEX "documents_corretorId_clientId_category_createdAt_idx" ON "harper_app_dev"."documents"("corretorId", "clientId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."documents" ADD CONSTRAINT "documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."documents" ADD CONSTRAINT "documents_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
