-- ============================
-- Sprint 1 - Clients: soft delete + audit + email CITEXT
-- Revisada para evitar DROP/ADD em colunas com dados
-- ============================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS citext;
-- (opcional) úteis para busca:
-- CREATE EXTENSION IF NOT EXISTS unaccent;
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Remover unicidades antigas (nomes conforme gerado pelo Prisma)
DROP INDEX IF EXISTS "harper_app_dev"."clients_corretorId_document_key";
DROP INDEX IF EXISTS "harper_app_dev"."clients_corretorId_email_key";

-- Corretor.email -> CITEXT (sem perda de dados)
ALTER TABLE "harper_app_dev"."Corretor"
  ALTER COLUMN "email" TYPE CITEXT USING "email"::citext;

-- User.email -> CITEXT (sem perda de dados e mantendo NOT NULL)
ALTER TABLE "harper_app_dev"."User"
  ALTER COLUMN "email" TYPE CITEXT USING "email"::citext;

-- Clients: soft delete + email -> CITEXT
ALTER TABLE "harper_app_dev"."clients"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "harper_app_dev"."clients"
  ALTER COLUMN "email" TYPE CITEXT USING "email"::citext;

-- Contatos.email -> CITEXT
ALTER TABLE "harper_app_dev"."contatos"
  ALTER COLUMN "email" TYPE CITEXT USING "email"::citext;

-- Audit log
CREATE TABLE IF NOT EXISTS "harper_app_dev"."audit_log" (
  "id" TEXT NOT NULL,
  "corretorId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "actorId" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- Índices audit
CREATE INDEX IF NOT EXISTS "audit_log_corretorId_entity_entityId_at_idx"
  ON "harper_app_dev"."audit_log" ("corretorId", "entity", "entityId", "at");

-- Índices/uniqueness de User (case-insensitive por tenant)
CREATE INDEX IF NOT EXISTS "User_email_idx"
  ON "harper_app_dev"."User" ("email");

CREATE UNIQUE INDEX IF NOT EXISTS "User_corretorId_email_key"
  ON "harper_app_dev"."User" ("corretorId", "email");

-- Índices de Clients
CREATE INDEX IF NOT EXISTS "clients_corretorId_email_idx"
  ON "harper_app_dev"."clients" ("corretorId", "email");

CREATE INDEX IF NOT EXISTS "clients_corretorId_deletedAt_idx"
  ON "harper_app_dev"."clients" ("corretorId", "deletedAt");

-- Unicidades somente para registros ativos (soft delete friendly)
CREATE UNIQUE INDEX IF NOT EXISTS "u_clients_active_email"
  ON "harper_app_dev"."clients" ("corretorId", "email")
  WHERE "deletedAt" IS NULL AND "email" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "u_clients_active_document"
  ON "harper_app_dev"."clients" ("corretorId", "document")
  WHERE "deletedAt" IS NULL AND "document" IS NOT NULL;
