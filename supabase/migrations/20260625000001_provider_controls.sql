-- Provider Controls: enable/disable/pause/maintenance per provider
CREATE TABLE IF NOT EXISTS public.provider_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled','paused','maintenance')),
  failure_count integer DEFAULT 0,
  consecutive_failures integer DEFAULT 0,
  last_failure_at timestamptz,
  last_failure_reason text,
  last_success_at timestamptz,
  disabled_by text,
  disabled_at timestamptz,
  auto_disabled boolean DEFAULT false,
  auto_recovery_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_controls TO authenticated;
GRANT ALL ON public.provider_controls TO service_role;
ALTER TABLE public.provider_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc admin all" ON public.provider_controls;
CREATE POLICY "pc admin all" ON public.provider_controls FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_pc_upd ON public.provider_controls;
CREATE TRIGGER trg_pc_upd BEFORE UPDATE ON public.provider_controls FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Insert default provider rows
INSERT INTO public.provider_controls (provider, status) VALUES
  ('linkedin', 'enabled'),
  ('indeed', 'enabled'),
  ('naukri', 'enabled'),
  ('wellfound', 'enabled'),
  ('instahyre', 'enabled')
ON CONFLICT (provider) DO NOTHING;

-- Provider health log for tracking failures, recoveries, and state changes
CREATE TABLE IF NOT EXISTS public.provider_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('failure','recovery','disabled','enabled','paused','resumed','maintenance','warning','info')),
  severity text DEFAULT 'info' CHECK (severity IN ('critical','warning','info')),
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_health_log TO authenticated;
GRANT ALL ON public.provider_health_log TO service_role;
ALTER TABLE public.provider_health_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "phl admin all" ON public.provider_health_log;
CREATE POLICY "phl admin all" ON public.provider_health_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_phl_provider_event ON public.provider_health_log (provider, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phl_created ON public.provider_health_log (created_at DESC);

-- Provider challenge registry (known failure patterns)
CREATE TABLE IF NOT EXISTS public.provider_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  challenge_type text NOT NULL,
  description text,
  symptom_pattern text,
  detection_logic text,
  recovery_steps jsonb DEFAULT '[]'::jsonb,
  fallback_strategy text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_challenges TO authenticated;
GRANT ALL ON public.provider_challenges TO service_role;
ALTER TABLE public.provider_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pch admin all" ON public.provider_challenges;
CREATE POLICY "pch admin all" ON public.provider_challenges FOR ALL TO authenticated USING (true) WITH CHECK (true);
