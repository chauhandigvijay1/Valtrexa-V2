CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.resume_parses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  resume_version_id uuid NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE,
  raw_text text,
  full_name text,
  email text,
  phone text,
  skills text[] NOT NULL DEFAULT '{}',
  experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  projects jsonb NOT NULL DEFAULT '[]'::jsonb,
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  parsed_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  parser_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resume_parses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resume_parses owner all" ON public.resume_parses;
CREATE POLICY "resume_parses owner all" ON public.resume_parses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_parses TO authenticated;
GRANT ALL ON public.resume_parses TO service_role;
CREATE INDEX IF NOT EXISTS idx_resume_parses_user ON public.resume_parses(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_parses_resume ON public.resume_parses(resume_id);
DROP TRIGGER IF EXISTS trg_resume_parses_updated ON public.resume_parses;
CREATE TRIGGER trg_resume_parses_updated BEFORE UPDATE ON public.resume_parses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.resume_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  resume_version_id uuid REFERENCES public.resume_versions(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  job_description text NOT NULL,
  ats_score int NOT NULL DEFAULT 0,
  missing_keywords text[] NOT NULL DEFAULT '{}',
  strengths text[] NOT NULL DEFAULT '{}',
  weaknesses text[] NOT NULL DEFAULT '{}',
  improvement_suggestions text[] NOT NULL DEFAULT '{}',
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.resume_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resume_analyses owner all" ON public.resume_analyses;
CREATE POLICY "resume_analyses owner all" ON public.resume_analyses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_analyses TO authenticated;
GRANT ALL ON public.resume_analyses TO service_role;
CREATE INDEX IF NOT EXISTS idx_resume_analyses_user ON public.resume_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_analyses_resume ON public.resume_analyses(resume_id);
DROP TRIGGER IF EXISTS trg_resume_analyses_updated ON public.resume_analyses;
CREATE TRIGGER trg_resume_analyses_updated BEFORE UPDATE ON public.resume_analyses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.tailored_resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  resume_version_id uuid REFERENCES public.resume_versions(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  job_description text NOT NULL,
  optimized_resume text NOT NULL,
  ats_friendly_resume text NOT NULL,
  missing_skills text[] NOT NULL DEFAULT '{}',
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tailored_resumes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tailored_resumes owner all" ON public.tailored_resumes;
CREATE POLICY "tailored_resumes owner all" ON public.tailored_resumes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tailored_resumes TO authenticated;
GRANT ALL ON public.tailored_resumes TO service_role;
CREATE INDEX IF NOT EXISTS idx_tailored_resumes_user ON public.tailored_resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_tailored_resumes_resume ON public.tailored_resumes(resume_id);
DROP TRIGGER IF EXISTS trg_tailored_resumes_updated ON public.tailored_resumes;
CREATE TRIGGER trg_tailored_resumes_updated BEFORE UPDATE ON public.tailored_resumes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.job_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  query text,
  imported_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_import_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_import_runs owner all" ON public.job_import_runs;
CREATE POLICY "job_import_runs owner all" ON public.job_import_runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_import_runs TO authenticated;
GRANT ALL ON public.job_import_runs TO service_role;
CREATE INDEX IF NOT EXISTS idx_job_import_runs_user ON public.job_import_runs(user_id);

CREATE TABLE IF NOT EXISTS public.workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_events owner all" ON public.workflow_events;
CREATE POLICY "workflow_events owner all" ON public.workflow_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_events TO authenticated;
GRANT ALL ON public.workflow_events TO service_role;
CREATE INDEX IF NOT EXISTS idx_workflow_events_user ON public.workflow_events(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_type ON public.workflow_events(event_type);

CREATE TABLE IF NOT EXISTS public.n8n_webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  target_url text NOT NULL,
  secret text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.n8n_webhook_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "n8n_webhook_subscriptions owner all" ON public.n8n_webhook_subscriptions;
CREATE POLICY "n8n_webhook_subscriptions owner all" ON public.n8n_webhook_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.n8n_webhook_subscriptions TO authenticated;
GRANT ALL ON public.n8n_webhook_subscriptions TO service_role;
CREATE INDEX IF NOT EXISTS idx_n8n_webhook_subscriptions_user ON public.n8n_webhook_subscriptions(user_id);
DROP TRIGGER IF EXISTS trg_n8n_webhook_subscriptions_updated ON public.n8n_webhook_subscriptions;
CREATE TRIGGER trg_n8n_webhook_subscriptions_updated BEFORE UPDATE ON public.n8n_webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.loom_scripts (
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
ALTER TABLE public.loom_scripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loom_scripts owner all" ON public.loom_scripts;
CREATE POLICY "loom_scripts owner all" ON public.loom_scripts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loom_scripts TO authenticated;
GRANT ALL ON public.loom_scripts TO service_role;
CREATE INDEX IF NOT EXISTS idx_loom_scripts_user ON public.loom_scripts(user_id);
DROP TRIGGER IF EXISTS trg_loom_scripts_updated ON public.loom_scripts;
CREATE TRIGGER trg_loom_scripts_updated BEFORE UPDATE ON public.loom_scripts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS file_size_bytes bigint;
ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS parsed_text text;
ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS parse_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS fit_summary text;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS gap_analysis text;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS job_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.company_research ADD COLUMN IF NOT EXISTS products text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.company_research ADD COLUMN IF NOT EXISTS hiring_signals text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.company_research ADD COLUMN IF NOT EXISTS funding_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.company_research ADD COLUMN IF NOT EXISTS engineering_culture_notes text;

ALTER TABLE public.painpoints ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.painpoints ADD COLUMN IF NOT EXISTS evidence text;
ALTER TABLE public.painpoints ADD COLUMN IF NOT EXISTS suggested_solution text;
ALTER TABLE public.painpoints ADD COLUMN IF NOT EXISTS signal_source text;

ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cold_email';
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS pain_points text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS generated_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS resumes_primary_unique_per_user ON public.resumes(user_id) WHERE is_primary = true;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_external_unique ON public.jobs(user_id, source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS company_research_user_company_unique ON public.company_research(user_id, company_name);

CREATE TABLE IF NOT EXISTS public.alert_preferences (
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
ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alert_preferences owner all" ON public.alert_preferences;
CREATE POLICY "alert_preferences owner all" ON public.alert_preferences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_preferences TO authenticated;
GRANT ALL ON public.alert_preferences TO service_role;
DROP TRIGGER IF EXISTS trg_alert_preferences_updated ON public.alert_preferences;
CREATE TRIGGER trg_alert_preferences_updated BEFORE UPDATE ON public.alert_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'telegram',
  category text NOT NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_queue owner all" ON public.notification_queue;
CREATE POLICY "notification_queue owner all" ON public.notification_queue FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_queue TO authenticated;
GRANT ALL ON public.notification_queue TO service_role;
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_status ON public.notification_queue(user_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_queue_category ON public.notification_queue(category, channel);
DROP TRIGGER IF EXISTS trg_notification_queue_updated ON public.notification_queue;
CREATE TRIGGER trg_notification_queue_updated BEFORE UPDATE ON public.notification_queue FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_single_primary_resume()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_primary IS TRUE THEN
    UPDATE public.resumes
    SET is_primary = false
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resumes_single_primary ON public.resumes;
CREATE TRIGGER trg_resumes_single_primary
BEFORE INSERT OR UPDATE OF is_primary ON public.resumes
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_primary_resume();

CREATE OR REPLACE FUNCTION public.handle_alert_preferences_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alert_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_alert_preferences_created ON auth.users;
CREATE TRIGGER on_auth_user_alert_preferences_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_alert_preferences_for_new_user();

CREATE OR REPLACE FUNCTION public.enqueue_notification_from_workflow_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  notification_category text;
  preferences public.alert_preferences%ROWTYPE;
BEGIN
  SELECT * INTO preferences
  FROM public.alert_preferences
  WHERE user_id = NEW.user_id;

  IF NEW.event_type IN ('jobs_imported', 'jobs_matched') THEN
    notification_category := 'job_alert';
    IF preferences.id IS NOT NULL AND preferences.high_match_job_alerts IS FALSE THEN RETURN NEW; END IF;
  ELSIF NEW.event_type = 'recruiter_added' THEN
    notification_category := 'recruiter_alert';
    IF preferences.id IS NOT NULL AND preferences.recruiter_discovery_alerts IS FALSE THEN RETURN NEW; END IF;
  ELSIF NEW.event_type = 'interview_added' THEN
    notification_category := 'interview_alert';
    IF preferences.id IS NOT NULL AND preferences.interview_alerts IS FALSE THEN RETURN NEW; END IF;
  ELSIF NEW.event_type = 'assessment_added' THEN
    notification_category := 'assessment_alert';
    IF preferences.id IS NOT NULL AND preferences.assessment_alerts IS FALSE THEN RETURN NEW; END IF;
  ELSIF NEW.event_type = 'painpoints_generated' THEN
    notification_category := 'pain_point_alert';
    IF preferences.id IS NOT NULL AND preferences.pain_point_alerts IS FALSE THEN RETURN NEW; END IF;
  ELSIF NEW.event_type = 'outreach_generated' THEN
    notification_category := 'outreach_alert';
  ELSIF NEW.event_type = 'loom_generated' THEN
    notification_category := 'loom_alert';
    IF preferences.id IS NOT NULL AND preferences.loom_script_alerts IS FALSE THEN RETURN NEW; END IF;
  ELSIF NEW.event_type = 'daily_summary_ready' THEN
    notification_category := 'daily_summary';
    IF preferences.id IS NOT NULL AND preferences.daily_summary_alerts IS FALSE THEN RETURN NEW; END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_queue (user_id, category, event_type, entity_type, entity_id, payload)
  VALUES (NEW.user_id, notification_category, NEW.event_type, NEW.entity_type, NEW.entity_id, NEW.payload);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workflow_events_notification_queue ON public.workflow_events;
CREATE TRIGGER trg_workflow_events_notification_queue
AFTER INSERT ON public.workflow_events
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_notification_from_workflow_event();

CREATE OR REPLACE FUNCTION public.enqueue_direct_crud_workflow_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_type_value text;
BEGIN
  IF TG_TABLE_NAME = 'recruiters' THEN
    event_type_value := 'recruiter_added';
  ELSIF TG_TABLE_NAME = 'interviews' THEN
    event_type_value := 'interview_added';
  ELSIF TG_TABLE_NAME = 'assessments' THEN
    event_type_value := 'assessment_added';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.workflow_events (user_id, event_type, entity_type, entity_id, payload)
  VALUES (NEW.user_id, event_type_value, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruiters_workflow_event ON public.recruiters;
CREATE TRIGGER trg_recruiters_workflow_event
AFTER INSERT ON public.recruiters
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_direct_crud_workflow_event();

DROP TRIGGER IF EXISTS trg_interviews_workflow_event ON public.interviews;
CREATE TRIGGER trg_interviews_workflow_event
AFTER INSERT ON public.interviews
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_direct_crud_workflow_event();

DROP TRIGGER IF EXISTS trg_assessments_workflow_event ON public.assessments;
CREATE TRIGGER trg_assessments_workflow_event
AFTER INSERT ON public.assessments
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_direct_crud_workflow_event();
