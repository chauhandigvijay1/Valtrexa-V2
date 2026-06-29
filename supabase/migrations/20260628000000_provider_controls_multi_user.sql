-- Fix provider_controls multi-user isolation bugs:
--   1. Drop global UNIQUE(provider) constraint blocking per-user rows
--   2. Add NOT NULL to user_id (column exists from previous migration but was nullable)
--   3. Delete orphaned global default rows with NULL user_id
--   4. Add UNIQUE(user_id, provider) for per-user isolation
--   5. Add user_id column to provider_health_log (was missing entirely)
--   6. Add per-user RLS policy on provider_health_log

BEGIN;

-- 1. Safely drop the UNIQUE(provider) constraint (auto-named by PG)
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'provider_controls'
    AND con.contype = 'u'
    AND array_to_string(con.conkey, ',') IN (
      SELECT array_to_string(STRING_TO_ARRAY(string_agg(a.attnum::text, ',' ORDER BY a.attnum), ','), ',')
      FROM pg_attribute a
      WHERE a.attrelid = con.conrelid
        AND a.attname = 'provider'
    );
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.provider_controls DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END IF;
END $$;

-- 2. Delete old global default rows that have NULL user_id (can't be assigned)
--    These rows were created by the original migration as singletons.
DELETE FROM public.provider_controls WHERE user_id IS NULL;

-- 3. Add NOT NULL to user_id on provider_controls (now that NULL rows are gone)
ALTER TABLE IF EXISTS public.provider_controls
  ALTER COLUMN user_id SET NOT NULL;

-- 4. Add UNIQUE(user_id, provider) for per-user isolation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_controls_user_id_provider_key'
  ) THEN
    ALTER TABLE public.provider_controls
      ADD UNIQUE (user_id, provider);
  END IF;
END $$;

-- 5. Add user_id column to provider_health_log (was missing)
ALTER TABLE IF EXISTS public.provider_health_log
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 6. Set NOT NULL on health_log user_id (existing rows get NULL, which is fine for old log entries)
--    New inserts via logHealthEvent() all include user_id.

-- 7. Add index on provider_health_log(user_id) for per-user queries
CREATE INDEX IF NOT EXISTS idx_phl_user_id ON public.provider_health_log (user_id);

-- 8. Update RLS on provider_health_log to be per-user
DROP POLICY IF EXISTS "phl admin all" ON public.provider_health_log;
CREATE POLICY "phl owner" ON public.provider_health_log
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR auth.role() = 'service_role')
  WITH CHECK (user_id = auth.uid() OR auth.role() = 'service_role');

GRANT ALL ON public.provider_health_log TO service_role, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
