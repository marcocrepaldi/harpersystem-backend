-- CreateIndex
CREATE INDEX "client_services_clientId_idx" ON "harper_app_dev"."client_services"("clientId");

-- CreateIndex
CREATE INDEX "client_tags_clientId_idx" ON "harper_app_dev"."client_tags"("clientId");

-- CreateIndex
CREATE INDEX "services_name_idx" ON "harper_app_dev"."services"("name");

-- CreateIndex
CREATE INDEX "tags_name_idx" ON "harper_app_dev"."tags"("name");
