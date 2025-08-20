-- CreateTable
CREATE TABLE "harper_app_dev"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "harper_app_dev"."User"("email");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."User" ADD CONSTRAINT "User_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "harper_app_dev"."Corretor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
