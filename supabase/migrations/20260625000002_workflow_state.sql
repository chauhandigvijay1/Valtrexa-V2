-- Workflow State: global start/stop/pause/resume for the automation pipeline
CREATE TABLE IF NOT EXISTS public.workflow_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'stopped' CHECK (status IN ('running','paused','stopped')),
  started_at timestamptz,
  stopped_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  started_by text,
  stopped_by text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one row: enforce singleton
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_state_singleton ON public.workflow_state ((true));

GRANT SELECT, INSERT, UPDATE ON public.workflow_state TO authenticated;
GRANT ALL ON public.workflow_state TO service_role;
ALTER TABLE public.workflow_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ws admin all" ON public.workflow_state;
CREATE POLICY "ws admin all" ON public.workflow_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_ws_upd ON public.workflow_state;
CREATE TRIGGER trg_ws_upd BEFORE UPDATE ON public.workflow_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Insert the singleton row
INSERT INTO public.workflow_state (status) VALUES ('stopped')
ON CONFLICT DO NOTHING;
