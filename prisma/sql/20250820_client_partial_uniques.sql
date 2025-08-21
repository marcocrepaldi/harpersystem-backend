-- Habilita citext se ainda não existir
CREATE EXTENSION IF NOT EXISTS citext;

-- Unicidade de e-mail por corretor para clientes ativos
CREATE UNIQUE INDEX IF NOT EXISTS "clients_unique_email_active"
ON "clients" ("corretorId", "email")
WHERE "deletedAt" IS NULL AND "email" IS NOT NULL;

-- Unicidade de document (CPF/CNPJ unificado) por corretor para clientes ativos
CREATE UNIQUE INDEX IF NOT EXISTS "clients_unique_document_active"
ON "clients" ("corretorId", "document")
WHERE "deletedAt" IS NULL AND "document" IS NOT NULL;

-- Unicidade de CNPJ PJ, se você usa pjCnpj separado
CREATE UNIQUE INDEX IF NOT EXISTS "clients_unique_pjcnpj_active"
ON "clients" ("corretorId", "pjCnpj")
WHERE "deletedAt" IS NULL AND "pjCnpj" IS NOT NULL;
