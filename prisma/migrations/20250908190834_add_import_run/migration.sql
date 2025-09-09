-- CreateTable
CREATE TABLE "harper_app_dev"."ImportRun" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "runId" TEXT,
    "latest" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportRun_runId_key" ON "harper_app_dev"."ImportRun"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "clientId_latest" ON "harper_app_dev"."ImportRun"("clientId", "latest");
