-- ============================================================================
-- VALTREXA-V2 — Corrected Production Migration
-- Fix: removed REFERENCES candidate_profiles(user_id) FK constraints because
--      candidate_profiles.user_id lacks UNIQUE constraint (standard Supabase
--      pattern: user_id REFERENCES auth.users(id), id is the PK).
--      Use plain uuid NOT NULL columns with indexes instead.
-- ============================================================================
-- Run this entire script in Supabase SQL Editor.
-- It will succeed even if some tables already exist (idempotent).
-- After completion run: NOTIFY pgrst, 'reload schema';
-- ============================================================================

BEGIN;

-- 1. Extend candidate_profiles with Candidate Brain columns
-- ============================================================================
ALTER TABLE IF EXISTS candidate_profiles
  ADD COLUMN IF NOT EXISTS preferred_roles jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS preferred_locations jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS salary_expectation numeric,
  ADD COLUMN IF NOT EXISTS years_experience integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skills jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS projects jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS experiences jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS education jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS resume_text text,
  ADD COLUMN IF NOT EXISTS resume_parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS brain_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS missing_fields jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- 2. Create workflow_state (workflow recovery)
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'stopped' CHECK (status IN ('running','paused','stopped')),
  cycle_id uuid,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_workflow_state_user ON workflow_state(user_id);
ALTER TABLE workflow_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_state_self ON workflow_state;
CREATE POLICY workflow_state_self ON workflow_state
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- 3. Create workflow_timeline (stage tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cycle_id uuid,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','skipped')),
  label text,
  message text,
  progress integer DEFAULT 0,
  total integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_timeline_user ON workflow_timeline(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_timeline_status ON workflow_timeline(user_id, status);
ALTER TABLE workflow_timeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_timeline_self ON workflow_timeline;
CREATE POLICY workflow_timeline_self ON workflow_timeline
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- 4. Create notifications (notification center)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','success')),
  read boolean DEFAULT false,
  read_at timestamptz,
  link text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = false;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_self ON notifications;
CREATE POLICY notifications_self ON notifications
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- 5. Create candidate_memory (dynamic profile memory)
-- ============================================================================
CREATE TABLE IF NOT EXISTS candidate_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic text NOT NULL,
  answer text NOT NULL,
  category text DEFAULT 'general' CHECK (category IN ('permanent','dynamic','general')),
  source text DEFAULT 'manual',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, topic)
);
CREATE INDEX IF NOT EXISTS idx_candidate_memory_user ON candidate_memory(user_id);
ALTER TABLE candidate_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS candidate_memory_self ON candidate_memory;
CREATE POLICY candidate_memory_self ON candidate_memory
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- 6. Ensure telegram_bindings has confirmed_at column (table created in migration 0003)
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_bindings' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE telegram_bindings ADD COLUMN confirmed_at timestamptz;
  END IF;
END $$;

-- 7. Create outreach (outreach engine)
-- ============================================================================
CREATE TABLE IF NOT EXISTS outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid,
  recruiter_id uuid,
  company text,
  recipient_name text,
  recipient_role text,
  subject text,
  body text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sent','rejected','scheduled')),
  approval_status text DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  approval_requested_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  loom_url text,
  attachments jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_user ON outreach(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_approval ON outreach(user_id, approval_status);
ALTER TABLE outreach ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_self ON outreach;
CREATE POLICY outreach_self ON outreach
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- 8. Create company_research (Pipeline B company intelligence)
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company text NOT NULL,
  industry text,
  size text,
  funding_stage text,
  pain_points jsonb DEFAULT '[]'::jsonb,
  hiring_team jsonb DEFAULT '[]'::jsonb,
  technologies jsonb DEFAULT '[]'::jsonb,
  culture text,
  recent_news jsonb DEFAULT '[]'::jsonb,
  raw_data jsonb DEFAULT '{}'::jsonb,
  researched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, company)
);
CREATE INDEX IF NOT EXISTS idx_company_research_user ON company_research(user_id);
ALTER TABLE company_research ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_research_self ON company_research;
CREATE POLICY company_research_self ON company_research
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- 9. Create workflow_log (cycle logging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  user_id uuid NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  status text,
  phases jsonb DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_log_user ON workflow_log(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_log_cycle ON workflow_log(cycle_id);
ALTER TABLE workflow_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_log_self ON workflow_log;
CREATE POLICY workflow_log_self ON workflow_log
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- 10. Drop orphan candidate_brain table
-- ============================================================================
DROP TABLE IF EXISTS candidate_brain;

-- 11. Create RPC: get_candidate_memory
-- ============================================================================
CREATE OR REPLACE FUNCTION get_candidate_memory(p_user_id uuid, p_topic text)
RETURNS TABLE (id uuid, user_id uuid, topic text, answer text, category text, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT cm.id, cm.user_id, cm.topic, cm.answer, cm.category, cm.updated_at
  FROM candidate_memory cm
  WHERE cm.user_id = p_user_id AND cm.topic = p_topic AND cm.is_active = true
  LIMIT 1;
END;
$$;

-- 12. Create RPC: reload_schema_cache
-- ============================================================================
CREATE OR REPLACE FUNCTION reload_schema_cache()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- 13. Create RPC: cleanup_old_notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_notifications(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM notifications
  WHERE created_at < now() - (p_days || ' days')::interval
    AND read = true;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- 14. Create updated_at trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 15. Create triggers
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'workflow_state_updated_at') THEN
    CREATE TRIGGER workflow_state_updated_at
      BEFORE UPDATE ON workflow_state
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'candidate_memory_updated_at') THEN
    CREATE TRIGGER candidate_memory_updated_at
      BEFORE UPDATE ON candidate_memory
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'outreach_updated_at') THEN
    CREATE TRIGGER outreach_updated_at
      BEFORE UPDATE ON outreach
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- 16. Grant permissions
-- ============================================================================
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 17. Enable extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

COMMIT;

-- ============================================================================
-- After this runs successfully, execute in SQL Editor:
--   NOTIFY pgrst, 'reload schema';
-- Then verify:
--   SELECT * FROM workflow_timeline LIMIT 1;
--   SELECT * FROM workflow_state LIMIT 1;
--   \dt workflow_* notifications candidate_memory telegram_bindings outreach company_research
-- ============================================================================
