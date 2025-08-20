-- AlterTable
ALTER TABLE "harper_app_dev"."User" ADD COLUMN     "refreshTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "User_corretorId_idx" ON "harper_app_dev"."User"("corretorId");
