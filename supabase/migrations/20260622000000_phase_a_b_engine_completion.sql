-- =========================================================================
-- PHASE A + B ENGINE COMPLETION MIGRATION
-- =========================================================================
-- Adds all schema required for:
--   A2  Opportunity Radar (unified job schema fields already exist; add score fields)
--   A4  Match Engine (multi-factor scoring decomposition)
--   A5  High Value Engine (strategic value scoring + signals)
--   A6  Recruiter Discovery Engine (confidence scoring + email verification)
--   A7  Apply Engine (primary resume only application packages)
--   A8  Batch Apply Engine (queue-driven batches)
--   A9  Outreach Engine (draft types + personalization metadata)
--   A10 Followup Engine (Day 3/7/14 cadence tracking)
--   A11 Inbox Intelligence (Gmail OAuth + classification)
--   B1  Playwright Platform (sessions / storage states)
--   B2  Redis + BullMQ (queue job records + audit trail)
--   B4  Event Bus (consumer + delivery history)
--
-- Idempotent: every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- =========================================================================

-- =========================================================================
-- A2/A4: Jobs enrichment — freshness score, application metadata
-- =========================================================================
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS raw_payload jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS normalized_roles text[] DEFAULT '{}';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS experience_level text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS work_mode text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_min integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_max integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS company_size text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS freshness_bucket text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS freshness_score integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS easy_apply boolean DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS provider text;

-- =========================================================================
-- A4: Match Engine — multi-factor score decomposition
-- =========================================================================
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS skills_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS role_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS experience_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS location_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS salary_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS freshness_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS company_quality_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS recruiter_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS score_breakdown jsonb;

-- =========================================================================
-- A5: High Value Engine — strategic value scoring
-- =========================================================================
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS target_value text DEFAULT 'normal';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS company_quality_score integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS hiring_activity_score integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS strategic_value_score integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS founder_detected boolean DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS value_tier text; -- high | medium | normal
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS growth_signals jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS funding_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tech_stack text[] DEFAULT '{}'::text[];
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS recruiter_density integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS open_job_count integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS recent_news text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS assessed_at timestamptz;

-- =========================================================================
-- A6: Recruiter Discovery Engine — confidence + verification
-- =========================================================================
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS role text;             -- Recruiter | Hiring Manager | Engineering Manager | Founder
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS profile_url text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS confidence_score numeric DEFAULT 0;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS discovered_via text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS relevance_score numeric DEFAULT 0;

-- =========================================================================
-- A7: Apply Engine — primary-resume-only application packages
-- =========================================================================
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS tier text;           -- A | B | C | D
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS match_score integer;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS package_generated boolean DEFAULT false;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS primary_resume_id uuid;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- =========================================================================
-- A8: Batch Apply Engine — queue-driven batches
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.batch_apply_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy text NOT NULL DEFAULT 'balanced', -- conservative | balanced | aggressive
  status text NOT NULL DEFAULT 'queued',     -- queued | running | completed | failed | cancelled
  approval_mode boolean NOT NULL DEFAULT true,
  filters jsonb DEFAULT '{}'::jsonb,
  job_ids text[] DEFAULT '{}'::text[],
  submitted_count integer DEFAULT 0,
  skipped_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_apply_runs TO authenticated;
GRANT ALL ON public.batch_apply_runs TO service_role;
ALTER TABLE public.batch_apply_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "bar owner all"
  ON public.batch_apply_runs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.batch_apply_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batch_apply_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | submitted | skipped | failed
  reason text,
  attempts integer DEFAULT 0,
  external_id text,
  tracking_url text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_apply_items TO authenticated;
GRANT ALL ON public.batch_apply_items TO service_role;
ALTER TABLE public.batch_apply_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "bai owner all"
  ON public.batch_apply_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- A10: Followup Engine — cadence metadata
-- =========================================================================
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS recruiter_id uuid;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS cadence text;   -- day_3 | day_7 | day_14 | custom
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS sequence_index integer;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS body text;

-- =========================================================================
-- A11: Inbox Intelligence — Gmail OAuth + classification
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id text,                          -- gmail message id
  thread_id text,
  from_address text,
  to_address text,
  subject text,
  snippet text,
  body text,
  classification text,                      -- interview | assessment | offer | rejection | recruiter_reply | other
  confidence numeric DEFAULT 0,
  classification_reason text,
  company_name text,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE SET NULL,
  received_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_messages TO authenticated;
GRANT ALL ON public.inbox_messages TO service_role;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "inbox owner all"
  ON public.inbox_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_received
  ON public.inbox_messages (user_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.gmail_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  expiry timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_tokens TO authenticated;
GRANT ALL ON public.gmail_tokens TO service_role;
ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "gmail owner all"
  ON public.gmail_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- B1: Playwright Platform — persistent sessions + storage states
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.browser_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,                   -- linkedin | indeed | naukri | instahyre | wellfound
  label text,
  storage_state jsonb DEFAULT '{}'::jsonb,  -- cookies + origins (Playwright storageState)
  cookies jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending',            -- pending | ready | expired | error
  last_used_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.browser_sessions TO authenticated;
GRANT ALL ON public.browser_sessions TO service_role;
ALTER TABLE public.browser_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "bs owner all"
  ON public.browser_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- B2/B3: Queue jobs — BullMQ job audit trail (mirrored from Redis for visibility)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.queue_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_name text NOT NULL,                 -- job-import | apply | recruiter | outreach | followup | gmail | analytics
  job_id text,                              -- bullmq job id
  payload jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'queued',             -- queued | active | completed | failed | delayed
  attempts integer DEFAULT 0,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_jobs TO authenticated;
GRANT ALL ON public.queue_jobs TO service_role;
ALTER TABLE public.queue_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "qj owner all"
  ON public.queue_jobs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_queue_jobs_user_queue
  ON public.queue_jobs (user_id, queue_name, created_at DESC);

-- =========================================================================
-- B4: Event Bus — delivery history + consumer registry
-- =========================================================================
ALTER TABLE public.workflow_events ADD COLUMN IF NOT EXISTS delivered boolean DEFAULT false;
ALTER TABLE public.workflow_events ADD COLUMN IF NOT EXISTS delivered_count integer DEFAULT 0;
ALTER TABLE public.workflow_events ADD COLUMN IF NOT EXISTS consumer_count integer DEFAULT 0;
ALTER TABLE public.workflow_events ADD COLUMN IF NOT EXISTS source text;

CREATE TABLE IF NOT EXISTS public.workflow_event_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.workflow_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumer text NOT NULL,                   -- webhook url / worker name / telegram
  status text NOT NULL DEFAULT 'pending',   -- pending | delivered | failed
  status_code integer,
  attempt integer DEFAULT 0,
  response_snippet text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_event_deliveries TO authenticated;
GRANT ALL ON public.workflow_event_deliveries TO service_role;
ALTER TABLE public.workflow_event_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wed owner all"
  ON public.workflow_event_deliveries FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_workflow_deliveries_event
  ON public.workflow_event_deliveries (event_id);

-- =========================================================================
-- updated_at triggers for new tables
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bar_upd ON public.batch_apply_runs;
CREATE TRIGGER trg_bar_upd BEFORE UPDATE ON public.batch_apply_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bai_upd ON public.batch_apply_items;
CREATE TRIGGER trg_bai_upd BEFORE UPDATE ON public.batch_apply_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_qj_upd ON public.queue_jobs;
CREATE TRIGGER trg_qj_upd BEFORE UPDATE ON public.queue_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bs_upd ON public.browser_sessions;
CREATE TRIGGER trg_bs_upd BEFORE UPDATE ON public.browser_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_gt_upd ON public.gmail_tokens;
CREATE TRIGGER trg_gt_upd BEFORE UPDATE ON public.gmail_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- Performance indexes for Opportunity Radar
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_user_source
  ON public.jobs (user_id, source);
CREATE INDEX IF NOT EXISTS idx_jobs_user_external
  ON public.jobs (user_id, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_user_source_external
  ON public.jobs (user_id, source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_matches_user_job
  ON public.job_matches (user_id, job_id);
