-- CreateTable
CREATE TABLE "harper_app_dev"."enderecos" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COBRANCA',
    "zip" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enderecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harper_app_dev"."contatos" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contatos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enderecos_clientId_idx" ON "harper_app_dev"."enderecos"("clientId");

-- CreateIndex
CREATE INDEX "contatos_clientId_idx" ON "harper_app_dev"."contatos"("clientId");

-- AddForeignKey
ALTER TABLE "harper_app_dev"."enderecos"
ADD CONSTRAINT "enderecos_clientId_fkey"
FOREIGN KEY ("clientId")
REFERENCES "harper_app_dev"."clients"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harper_app_dev"."contatos"
ADD CONSTRAINT "contatos_clientId_fkey"
FOREIGN KEY ("clientId")
REFERENCES "harper_app_dev"."clients"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Backfill idempotente (cria 0 ou 1 endereço/contato por cliente a partir
-- dos campos legados do Client). Completa somente quando há dados legados.
-- Rodar em banco vazio não gera linhas (tudo bem).
-- ---------------------------------------------------------------------

-- Endereços a partir de address* (COBRANCA)
INSERT INTO "harper_app_dev"."enderecos" (
  "id","clientId","type","zip","street","number","complement","district","city","state","country","createdAt","updatedAt"
)
SELECT
  'adr_' || md5(clock_timestamp()::text || random()::text || c."id") AS "id",
  c."id"         AS "clientId",
  'COBRANCA'     AS "type",
  NULLIF(BTRIM(c."addressZip"),        '') AS "zip",
  NULLIF(BTRIM(c."addressStreet"),     '') AS "street",
  NULLIF(BTRIM(c."addressNumber"),     '') AS "number",
  NULLIF(BTRIM(c."addressComplement"), '') AS "complement",
  NULLIF(BTRIM(c."addressDistrict"),   '') AS "district",
  NULLIF(BTRIM(c."addressCity"),       '') AS "city",
  NULLIF(BTRIM(c."addressState"),      '') AS "state",
  COALESCE(NULLIF(BTRIM(c."addressCountry"), ''), 'BR') AS "country",
  NOW() AS "createdAt",
  NOW() AS "updatedAt"
FROM "harper_app_dev"."clients" c
WHERE
  (
    COALESCE(NULLIF(BTRIM(c."addressZip"),        ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."addressStreet"),     ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."addressNumber"),     ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."addressComplement"), ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."addressDistrict"),   ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."addressCity"),       ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."addressState"),      ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."addressCountry"),    ''), NULL) IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "harper_app_dev"."enderecos" e
    WHERE e."clientId" = c."id"
  );

-- Contatos primários a partir de primaryContact*
INSERT INTO "harper_app_dev"."contatos" (
  "id","clientId","name","role","email","phone","notes","isPrimary","createdAt","updatedAt"
)
SELECT
  'ctt_' || md5(clock_timestamp()::text || random()::text || c."id") AS "id",
  c."id" AS "clientId",
  NULLIF(BTRIM(c."primaryContactName"),  '') AS "name",
  NULLIF(BTRIM(c."primaryContactRole"),  '') AS "role",
  NULLIF(BTRIM(c."primaryContactEmail"), '') AS "email",
  NULLIF(BTRIM(c."primaryContactPhone"), '') AS "phone",
  NULLIF(BTRIM(c."primaryContactNotes"), '') AS "notes",
  TRUE  AS "isPrimary",
  NOW() AS "createdAt",
  NOW() AS "updatedAt"
FROM "harper_app_dev"."clients" c
WHERE
  (
    COALESCE(NULLIF(BTRIM(c."primaryContactName"),  ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."primaryContactRole"),  ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."primaryContactEmail"), ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."primaryContactPhone"), ''), NULL) IS NOT NULL OR
    COALESCE(NULLIF(BTRIM(c."primaryContactNotes"), ''), NULL) IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "harper_app_dev"."contatos" ct
    WHERE ct."clientId" = c."id" AND ct."isPrimary" = TRUE
  );
