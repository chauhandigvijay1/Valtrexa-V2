-- Production Stability & Multi-User Isolation Migration
-- Adds last_health_check_at, user_id to provider_controls,
-- UNIQUE constraint on applications, per-user RLS, and trigger fix.

-- 1. Add last_health_check_at to provider_controls
ALTER TABLE IF EXISTS public.provider_controls
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz;

-- 2. Add user_id to provider_controls for multi-user isolation
ALTER TABLE IF EXISTS public.provider_controls
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. UNIQUE constraint on applications (prevent duplicate applications for same job by same user)
DELETE FROM public.applications a1 USING public.applications a2
  WHERE a1.id < a2.id AND a1.user_id = a2.user_id AND a1.job_id = a2.job_id;
ALTER TABLE IF EXISTS public.applications
  ADD CONSTRAINT applications_user_job_unique UNIQUE (user_id, job_id);

-- 4. Fix RLS on provider_controls to be per-user
DROP POLICY IF EXISTS "pc admin all" ON public.provider_controls;
-- Users can manage their own provider controls, admins can manage all
CREATE POLICY "pc owner" ON public.provider_controls
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR auth.role() = 'service_role')
  WITH CHECK (user_id = auth.uid() OR auth.role() = 'service_role');

-- 5. Drop the old trigger and recreate
DROP TRIGGER IF EXISTS trg_pc_upd ON public.provider_controls;
CREATE TRIGGER trg_pc_upd BEFORE UPDATE ON public.provider_controls FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
