CREATE TABLE public.resume_parses (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_parses TO authenticated;
GRANT ALL ON public.resume_parses TO service_role;
ALTER TABLE public.resume_parses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resume_parses owner all" ON public.resume_parses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_resume_parses_user ON public.resume_parses(user_id);
CREATE INDEX idx_resume_parses_resume ON public.resume_parses(resume_id);
CREATE TRIGGER trg_resume_parses_updated BEFORE UPDATE ON public.resume_parses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.resume_analyses (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_analyses TO authenticated;
GRANT ALL ON public.resume_analyses TO service_role;
ALTER TABLE public.resume_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resume_analyses owner all" ON public.resume_analyses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_resume_analyses_user ON public.resume_analyses(user_id);
CREATE INDEX idx_resume_analyses_resume ON public.resume_analyses(resume_id);
CREATE TRIGGER trg_resume_analyses_updated BEFORE UPDATE ON public.resume_analyses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tailored_resumes (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tailored_resumes TO authenticated;
GRANT ALL ON public.tailored_resumes TO service_role;
ALTER TABLE public.tailored_resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tailored_resumes owner all" ON public.tailored_resumes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_tailored_resumes_user ON public.tailored_resumes(user_id);
CREATE INDEX idx_tailored_resumes_resume ON public.tailored_resumes(resume_id);
CREATE TRIGGER trg_tailored_resumes_updated BEFORE UPDATE ON public.tailored_resumes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.job_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  query text,
  imported_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_import_runs TO authenticated;
GRANT ALL ON public.job_import_runs TO service_role;
ALTER TABLE public.job_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_import_runs owner all" ON public.job_import_runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_job_import_runs_user ON public.job_import_runs(user_id);

CREATE TABLE public.workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_events TO authenticated;
GRANT ALL ON public.workflow_events TO service_role;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_events owner all" ON public.workflow_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_workflow_events_user ON public.workflow_events(user_id);
CREATE INDEX idx_workflow_events_type ON public.workflow_events(event_type);

CREATE TABLE public.n8n_webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  target_url text NOT NULL,
  secret text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.n8n_webhook_subscriptions TO authenticated;
GRANT ALL ON public.n8n_webhook_subscriptions TO service_role;
ALTER TABLE public.n8n_webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "n8n_webhook_subscriptions owner all" ON public.n8n_webhook_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_n8n_webhook_subscriptions_user ON public.n8n_webhook_subscriptions(user_id);
CREATE TRIGGER trg_n8n_webhook_subscriptions_updated BEFORE UPDATE ON public.n8n_webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.resume_versions
  ADD COLUMN storage_path text,
  ADD COLUMN file_name text,
  ADD COLUMN file_type text,
  ADD COLUMN file_size_bytes bigint,
  ADD COLUMN parsed_text text,
  ADD COLUMN parse_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.jobs
  ADD COLUMN external_id text,
  ADD COLUMN source_type text,
  ADD COLUMN posted_at timestamptz,
  ADD COLUMN raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.job_matches
  ADD COLUMN fit_summary text,
  ADD COLUMN gap_analysis text,
  ADD COLUMN job_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.company_research
  ADD COLUMN products text[] NOT NULL DEFAULT '{}',
  ADD COLUMN hiring_signals text[] NOT NULL DEFAULT '{}',
  ADD COLUMN funding_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN engineering_culture_notes text;

ALTER TABLE public.painpoints
  ADD COLUMN category text,
  ADD COLUMN evidence text,
  ADD COLUMN suggested_solution text,
  ADD COLUMN signal_source text;

ALTER TABLE public.outreach_messages
  ADD COLUMN kind text NOT NULL DEFAULT 'cold_email',
  ADD COLUMN company_name text,
  ADD COLUMN pain_points text[] NOT NULL DEFAULT '{}',
  ADD COLUMN generated_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS resumes_primary_unique_per_user
  ON public.resumes(user_id)
  WHERE is_primary = true;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_external_unique
  ON public.jobs(user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_research_user_company_unique
  ON public.company_research(user_id, company_name);

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

CREATE TRIGGER trg_resumes_single_primary
BEFORE INSERT OR UPDATE OF is_primary ON public.resumes
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_primary_resume();

CREATE OR REPLACE FUNCTION public.enqueue_workflow_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_type_value text;
BEGIN
  IF TG_TABLE_NAME = 'jobs' THEN
    event_type_value := 'new_job_found';
  ELSIF TG_TABLE_NAME = 'tailored_resumes' THEN
    event_type_value := 'resume_generated';
  ELSIF TG_TABLE_NAME = 'job_matches' THEN
    event_type_value := 'match_generated';
  ELSIF TG_TABLE_NAME = 'outreach_messages' THEN
    event_type_value := 'outreach_generated';
  ELSIF TG_TABLE_NAME = 'interviews' THEN
    IF NEW.status <> 'scheduled' THEN
      RETURN NEW;
    END IF;
    event_type_value := 'interview_scheduled';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.workflow_events (user_id, event_type, entity_type, entity_id, payload)
  VALUES (
    NEW.user_id,
    event_type_value,
    TG_TABLE_NAME,
    NEW.id,
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jobs_workflow_event
AFTER INSERT ON public.jobs
FOR EACH ROW
WHEN (NEW.external_id IS NOT NULL)
EXECUTE FUNCTION public.enqueue_workflow_event();

CREATE TRIGGER trg_tailored_resumes_workflow_event
AFTER INSERT ON public.tailored_resumes
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_workflow_event();

CREATE TRIGGER trg_job_matches_workflow_event
AFTER INSERT ON public.job_matches
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_workflow_event();

CREATE TRIGGER trg_outreach_messages_workflow_event
AFTER INSERT ON public.outreach_messages
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_workflow_event();

CREATE TRIGGER trg_interviews_workflow_event
AFTER INSERT OR UPDATE OF status, scheduled_at ON public.interviews
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_workflow_event();
