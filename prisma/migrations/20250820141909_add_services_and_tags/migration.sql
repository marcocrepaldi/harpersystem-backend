-- CreateTable
CREATE TABLE "harper_app_dev"."services" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."client_services" (
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "client_services_pkey" PRIMARY KEY ("clientId","serviceId")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."tags" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."client_tags" (
    "clientId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "client_tags_pkey" PRIMARY KEY ("clientId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "harper_app_dev"."services"("slug");

-- CreateIndex
CREATE INDEX "idx_service_slug" ON "harper_app_dev"."services"("slug");

-- CreateIndex
CREATE INDEX "client_services_serviceId_idx" ON "harper_app_dev"."client_services"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "harper_app_dev"."tags"("slug");

-- CreateIndex
CREATE INDEX "client_tags_tagId_idx" ON "harper_app_dev"."client_tags"("tagId");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."client_services" ADD CONSTRAINT "client_services_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."client_services" ADD CONSTRAINT "client_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "harper_app_dev"."services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."client_tags" ADD CONSTRAINT "client_tags_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "harper_app_dev"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."client_tags" ADD CONSTRAINT "client_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "harper_app_dev"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
