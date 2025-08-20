/*
  20250818134635_add_relation_regra_cobranca_beneficiario (resiliente)
*/
BEGIN;
SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '5min';

DO $$
DECLARE
  has_beneficiaries BOOLEAN := to_regclass('harper_app_dev.health_beneficiaries') IS NOT NULL;
  has_rules         BOOLEAN := to_regclass('harper_app_dev.health_billing_rules') IS NOT NULL;
  has_fk            BOOLEAN;
BEGIN
  IF has_beneficiaries THEN
    EXECUTE 'ALTER TABLE "harper_app_dev"."health_beneficiaries" ADD COLUMN IF NOT EXISTS "regraCobrancaId" TEXT';

    EXECUTE 'CREATE INDEX IF NOT EXISTS "health_beneficiaries_regraCobrancaId_idx"
             ON "harper_app_dev"."health_beneficiaries"("regraCobrancaId")';

    IF has_rules THEN
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'harper_app_dev'
          AND table_name = 'health_beneficiaries'
          AND constraint_name = 'health_beneficiaries_regraCobrancaId_fkey'
      ) INTO has_fk;

      IF has_fk THEN
        EXECUTE 'ALTER TABLE "harper_app_dev"."health_beneficiaries"
                 DROP CONSTRAINT "health_beneficiaries_regraCobrancaId_fkey"';
      END IF;

      EXECUTE 'ALTER TABLE "harper_app_dev"."health_beneficiaries"
               ADD CONSTRAINT "health_beneficiaries_regraCobrancaId_fkey"
               FOREIGN KEY ("regraCobrancaId")
               REFERENCES "harper_app_dev"."health_billing_rules"("id")
               ON DELETE SET NULL
               ON UPDATE CASCADE';
    END IF;
  END IF;
END
$$ LANGUAGE plpgsql;

COMMIT;
