CREATE TABLE public.loom_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE SET NULL,
  resume_id uuid REFERENCES public.resumes(id) ON DELETE SET NULL,
  painpoint_ids uuid[] NOT NULL DEFAULT '{}',
  hook text NOT NULL,
  problem_statement text NOT NULL,
  solution_pitch text NOT NULL,
  cta text NOT NULL,
  full_script text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loom_scripts TO authenticated;
GRANT ALL ON public.loom_scripts TO service_role;
ALTER TABLE public.loom_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loom_scripts owner all" ON public.loom_scripts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_loom_scripts_user ON public.loom_scripts(user_id);
CREATE TRIGGER trg_loom_scripts_updated BEFORE UPDATE ON public.loom_scripts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date date NOT NULL DEFAULT CURRENT_DATE,
  summary_text text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_summaries TO authenticated;
GRANT ALL ON public.daily_summaries TO service_role;
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_summaries owner all" ON public.daily_summaries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE UNIQUE INDEX idx_daily_summaries_user_date ON public.daily_summaries(user_id, summary_date);

CREATE TABLE public.alert_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_enabled boolean NOT NULL DEFAULT false,
  high_match_job_alerts boolean NOT NULL DEFAULT true,
  pain_point_alerts boolean NOT NULL DEFAULT true,
  loom_script_alerts boolean NOT NULL DEFAULT true,
  recruiter_discovery_alerts boolean NOT NULL DEFAULT true,
  interview_alerts boolean NOT NULL DEFAULT true,
  assessment_alerts boolean NOT NULL DEFAULT true,
  daily_summary_alerts boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_preferences TO authenticated;
GRANT ALL ON public.alert_preferences TO service_role;
ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_preferences owner all" ON public.alert_preferences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_alert_preferences_updated BEFORE UPDATE ON public.alert_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_alert_preferences_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.alert_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_alert_preferences_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_alert_preferences_for_new_user();

CREATE OR REPLACE FUNCTION public.enqueue_custom_workflow_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_type_value text;
BEGIN
  IF TG_TABLE_NAME = 'painpoints' THEN
    event_type_value := 'pain_point_generated';
  ELSIF TG_TABLE_NAME = 'loom_scripts' THEN
    event_type_value := 'loom_script_generated';
  ELSIF TG_TABLE_NAME = 'recruiters' THEN
    event_type_value := 'recruiter_discovered';
  ELSIF TG_TABLE_NAME = 'assessments' THEN
    event_type_value := 'assessment_created';
  ELSIF TG_TABLE_NAME = 'daily_summaries' THEN
    event_type_value := 'daily_summary_ready';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.workflow_events (user_id, event_type, entity_type, entity_id, payload)
  VALUES (NEW.user_id, event_type_value, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_painpoints_custom_workflow_event
AFTER INSERT ON public.painpoints
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_custom_workflow_event();

CREATE TRIGGER trg_loom_scripts_custom_workflow_event
AFTER INSERT ON public.loom_scripts
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_custom_workflow_event();

CREATE TRIGGER trg_recruiters_custom_workflow_event
AFTER INSERT ON public.recruiters
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_custom_workflow_event();

CREATE TRIGGER trg_assessments_custom_workflow_event
AFTER INSERT ON public.assessments
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_custom_workflow_event();

CREATE TRIGGER trg_daily_summaries_custom_workflow_event
AFTER INSERT ON public.daily_summaries
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_custom_workflow_event();
