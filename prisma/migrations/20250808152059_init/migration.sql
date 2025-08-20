-- CreateTable
CREATE TABLE "harper_app_dev"."Corretor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subdomain" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Corretor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Corretor_email_key" ON "harper_app_dev"."Corretor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Corretor_subdomain_key" ON "harper_app_dev"."Corretor"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Corretor_slug_key" ON "harper_app_dev"."Corretor"("slug");
