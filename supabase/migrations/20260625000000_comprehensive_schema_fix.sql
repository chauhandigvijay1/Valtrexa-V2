-- =============================================================================
-- COMPREHENSIVE SCHEMA MIGRATION — based on REAL PRODUCTION DATABASE STATE
-- =============================================================================
-- Generated from direct Supabase DB inspection on 2026-06-23.
-- Every migration file in supabase/migrations/ was compared against the
-- actual schema in information_schema.columns and
-- supabase_migrations.schema_migrations.
--
-- Migration 20260622000000_phase_a_b_engine_completion.sql is listed as
-- APPLIED but only its INITIAL version ran. Columns/tables added to the
-- .sql file AFTER initial application are MISSING from the database.
-- This migration fills ALL gaps discovered.
--
-- Migration 20260624000000_fix_migration_bugs.sql was NEVER applied.
-- Its contents are included here.
-- =============================================================================
-- SAFETY: Every ALTER / CREATE uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Existing data is NEVER modified or dropped. Safe for production re-run.
-- =============================================================================

BEGIN;

-- =====================================================================
-- PRE-REQUISITE: set_updated_at function (idempotent re-create)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- =====================================================================
-- PHASE A+B MISSING TABLES (from 20260622000000, never created)
-- =====================================================================

-- 1. batch_apply_runs
CREATE TABLE IF NOT EXISTS public.batch_apply_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy text NOT NULL DEFAULT 'balanced',
  status text NOT NULL DEFAULT 'queued',
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
DROP POLICY IF EXISTS "bar owner all" ON public.batch_apply_runs;
CREATE POLICY "bar owner all"
  ON public.batch_apply_runs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP TRIGGER IF EXISTS trg_bar_upd ON public.batch_apply_runs;
CREATE TRIGGER trg_bar_upd BEFORE UPDATE ON public.batch_apply_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. batch_apply_items
CREATE TABLE IF NOT EXISTS public.batch_apply_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batch_apply_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
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
DROP POLICY IF EXISTS "bai owner all" ON public.batch_apply_items;
CREATE POLICY "bai owner all"
  ON public.batch_apply_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP TRIGGER IF EXISTS trg_bai_upd ON public.batch_apply_items;
CREATE TRIGGER trg_bai_upd BEFORE UPDATE ON public.batch_apply_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. inbox_messages
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id text,
  thread_id text,
  from_address text,
  to_address text,
  subject text,
  snippet text,
  body text,
  classification text,
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
DROP POLICY IF EXISTS "inbox owner all" ON public.inbox_messages;
CREATE POLICY "inbox owner all"
  ON public.inbox_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_received
  ON public.inbox_messages (user_id, received_at DESC);

-- 4. gmail_tokens
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
DROP POLICY IF EXISTS "gmail owner all" ON public.gmail_tokens;
CREATE POLICY "gmail owner all"
  ON public.gmail_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP TRIGGER IF EXISTS trg_gt_upd ON public.gmail_tokens;
CREATE TRIGGER trg_gt_upd BEFORE UPDATE ON public.gmail_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. queue_jobs
CREATE TABLE IF NOT EXISTS public.queue_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_name text NOT NULL,
  job_id text,
  payload jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'queued',
  attempts integer DEFAULT 0,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_jobs TO authenticated;
GRANT ALL ON public.queue_jobs TO service_role;
ALTER TABLE public.queue_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qj owner all" ON public.queue_jobs;
CREATE POLICY "qj owner all"
  ON public.queue_jobs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_queue_jobs_user_queue
  ON public.queue_jobs (user_id, queue_name, created_at DESC);
DROP TRIGGER IF EXISTS trg_qj_upd ON public.queue_jobs;
CREATE TRIGGER trg_qj_upd BEFORE UPDATE ON public.queue_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. workflow_event_deliveries
CREATE TABLE IF NOT EXISTS public.workflow_event_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.workflow_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumer text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  status_code integer,
  attempt integer DEFAULT 0,
  response_snippet text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_event_deliveries TO authenticated;
GRANT ALL ON public.workflow_event_deliveries TO service_role;
ALTER TABLE public.workflow_event_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wed owner all" ON public.workflow_event_deliveries;
CREATE POLICY "wed owner all"
  ON public.workflow_event_deliveries FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_workflow_deliveries_event
  ON public.workflow_event_deliveries (event_id);

-- =====================================================================
-- NEW APPLICATION TABLES (gmail_messages, outreach_drafts)
-- =====================================================================

-- 7. gmail_messages (telegram.ts analytics — counts by classification)
CREATE TABLE IF NOT EXISTS public.gmail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id text,
  thread_id text,
  from_address text,
  to_address text,
  subject text,
  snippet text,
  body text,
  classification text,
  confidence numeric DEFAULT 0,
  classification_reason text,
  company_name text,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE SET NULL,
  received_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_messages TO authenticated;
GRANT ALL ON public.gmail_messages TO service_role;
ALTER TABLE public.gmail_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gm owner all" ON public.gmail_messages;
CREATE POLICY "gm owner all"
  ON public.gmail_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_classification
  ON public.gmail_messages (user_id, classification);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_received
  ON public.gmail_messages (user_id, received_at DESC);
DROP TRIGGER IF EXISTS trg_gm_upd ON public.gmail_messages;
CREATE TRIGGER trg_gm_upd BEFORE UPDATE ON public.gmail_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. outreach_drafts (Telegram approval workflow)
CREATE TABLE IF NOT EXISTS public.outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE SET NULL,
  company_name text,
  subject text,
  body text,
  status text NOT NULL DEFAULT 'pending',
  kind text,
  pain_points text[] DEFAULT '{}'::text[],
  generated_context jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_drafts TO authenticated;
GRANT ALL ON public.outreach_drafts TO service_role;
ALTER TABLE public.outreach_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "od owner all" ON public.outreach_drafts;
CREATE POLICY "od owner all"
  ON public.outreach_drafts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_user_status
  ON public.outreach_drafts (user_id, status);
DROP TRIGGER IF EXISTS trg_od_upd ON public.outreach_drafts;
CREATE TRIGGER trg_od_upd BEFORE UPDATE ON public.outreach_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- MISSING COLUMNS ON applications
-- =====================================================================
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS primary_resume_id uuid;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS external_id text;

-- =====================================================================
-- MISSING COLUMNS ON jobs
-- =====================================================================
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS raw_payload jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS normalized_roles text[] DEFAULT '{}';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS work_mode text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_min integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_max integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS freshness_bucket text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS freshness_score integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS provider text;

-- =====================================================================
-- MISSING COLUMNS ON job_matches
-- =====================================================================
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS skills_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS role_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS experience_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS location_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS salary_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS freshness_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS company_quality_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS recruiter_score integer;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS score_breakdown jsonb;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS fit_summary text;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS gap_analysis text;
ALTER TABLE public.job_matches ADD COLUMN IF NOT EXISTS job_snapshot jsonb;

-- =====================================================================
-- MISSING COLUMNS ON companies
-- =====================================================================
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS value_tier text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS growth_signals jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS funding_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tech_stack text[] DEFAULT '{}'::text[];
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS recruiter_density integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS open_job_count integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS recent_news text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS assessed_at timestamptz;

-- =====================================================================
-- MISSING COLUMNS ON recruiters
-- =====================================================================
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS confidence_score numeric DEFAULT 0;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;

-- =====================================================================
-- MISSING COLUMNS ON followups
-- =====================================================================
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS cadence text;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS sequence_index integer;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- =====================================================================
-- MISSING COLUMNS ON workflow_events
-- =====================================================================
ALTER TABLE public.workflow_events ADD COLUMN IF NOT EXISTS delivered boolean DEFAULT false;
ALTER TABLE public.workflow_events ADD COLUMN IF NOT EXISTS delivered_count integer DEFAULT 0;
ALTER TABLE public.workflow_events ADD COLUMN IF NOT EXISTS consumer_count integer DEFAULT 0;
ALTER TABLE public.workflow_events ADD COLUMN IF NOT EXISTS source text;

-- =====================================================================
-- MISSING COLUMNS ON outreach_messages
-- =====================================================================
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS pain_points text[];
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS generated_context jsonb;
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS error_message text;

-- =====================================================================
-- MISSING COLUMNS ON resume_versions
-- =====================================================================
ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS parsed_text text;
ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS parse_status text;

-- =====================================================================
-- MISSING INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_user_source
  ON public.jobs (user_id, source);
CREATE INDEX IF NOT EXISTS idx_jobs_user_external
  ON public.jobs (user_id, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_user_source_external
  ON public.jobs (user_id, source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_matches_user_job
  ON public.job_matches (user_id, job_id);

-- =====================================================================
-- FIX: enqueue_direct_crud_workflow_event (from 20260624000000,
-- NEVER APPLIED). Corrects column name: uses event_kind as event_type.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enqueue_direct_crud_workflow_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  event_kind TEXT;
  entity_kind TEXT;
BEGIN
  entity_kind := TG_TABLE_NAME;
  IF TG_OP = 'INSERT' THEN
    event_kind := entity_kind || '_created';
  ELSIF TG_OP = 'UPDATE' THEN
    event_kind := entity_kind || '_updated';
  ELSIF TG_OP = 'DELETE' THEN
    event_kind := entity_kind || '_deleted';
  END IF;

  INSERT INTO public.workflow_events (event_type, entity_id, entity_type, user_id, payload)
  VALUES (
    event_kind,
    COALESCE(NEW.id, OLD.id)::TEXT,
    entity_kind,
    COALESCE(NEW.user_id, OLD.user_id),
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'timestamp', now()
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

COMMIT;

-- =========================================================================
-- ROLLBACK NOTES
-- =========================================================================
-- To revert the ENTIRE migration (WARNING: destroys data in new tables):
--   DROP TABLE IF EXISTS public.gmail_messages CASCADE;
--   DROP TABLE IF EXISTS public.outreach_drafts CASCADE;
--   DROP TABLE IF EXISTS public.workflow_event_deliveries CASCADE;
--   DROP TABLE IF EXISTS public.queue_jobs CASCADE;
--   DROP TABLE IF EXISTS public.gmail_tokens CASCADE;
--   DROP TABLE IF EXISTS public.inbox_messages CASCADE;
--   DROP TABLE IF EXISTS public.batch_apply_items CASCADE;
--   DROP TABLE IF EXISTS public.batch_apply_runs CASCADE;
--
-- To revert a single column (safe, no data loss):
--   ALTER TABLE public.applications DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.applications DROP COLUMN IF EXISTS provider;
--   ... (same pattern for other columns)
-- =========================================================================
