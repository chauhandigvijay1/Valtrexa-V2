-- =========================================================================
-- PHASE P1-P8 COMPLETION MIGRATION
-- =========================================================================
-- Adds all schema required for:
--   P1: Real Apply Automation (evidence storage)
--   P2: Approval Workflow (approval requests)
--   P3: Recruiter Discovery V3 (source metadata, confidence)
--   P4: Email Discovery Engine (verified email pipeline)
--   P5: High Value Engine V3 (AI scoring, classification)
--   P6: Playwright Autonomy (evidence storage)
--   P8: Telegram HQ (approvals, highvalue, followups)
-- =========================================================================

-- =========================================================================
-- P1/P6: Apply Evidence Storage
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.apply_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  evidence_type text NOT NULL, -- screenshot | html_snapshot | submission_log | form_data
  storage_path text,
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apply_evidence TO authenticated;
GRANT ALL ON public.apply_evidence TO service_role;
ALTER TABLE public.apply_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ae owner all"
  ON public.apply_evidence FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_apply_evidence_app
  ON public.apply_evidence (application_id);
CREATE INDEX IF NOT EXISTS idx_apply_evidence_user
  ON public.apply_evidence (user_id, created_at DESC);

-- =========================================================================
-- P2: Approval Workflow
-- =========================================================================
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS approval_status text; -- pending | approved | rejected
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS approval_responded_at timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS approval_telegram_message_id integer;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS ai_generated_answers jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS submitted_via text; -- direct | approval_workflow | batch

-- =========================================================================
-- P3: Recruiter Discovery V3 - source metadata
-- =========================================================================
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS source_metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS discovered_at timestamptz;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

-- =========================================================================
-- P4: Email Discovery Engine
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE CASCADE,
  email text NOT NULL,
  confidence text NOT NULL DEFAULT 'UNKNOWN', -- VERIFIED | LIKELY | UNKNOWN
  verification_method text, -- mx_validation | website_extraction | pattern_inference | manual
  mx_valid boolean DEFAULT false,
  mx_records text[],
  source_url text,
  source_page text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_verifications TO authenticated;
GRANT ALL ON public.email_verifications TO service_role;
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ev owner all"
  ON public.email_verifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_email_verifications_recruiter
  ON public.email_verifications (recruiter_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email
  ON public.email_verifications (email);

-- =========================================================================
-- P5: High Value Engine V3 - enhanced scoring
-- =========================================================================
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS priority_score integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS priority_tier text; -- LOW | MEDIUM | HIGH | ELITE
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS hiring_velocity integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS engineering_maturity_score integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS remote_friendliness integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS product_momentum_score integer DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ai_score_breakdown jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ai_assessed_at timestamptz;

-- =========================================================================
-- P8: Telegram HQ - approval tracking
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL, -- application | outreach | batch_item
  entity_id text NOT NULL,
  telegram_message_id integer,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  callback_data text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_requests TO authenticated;
GRANT ALL ON public.approval_requests TO service_role;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ar owner all"
  ON public.approval_requests FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_approval_requests_user
  ON public.approval_requests (user_id, status);

-- =========================================================================
-- updated_at triggers
-- =========================================================================
DROP TRIGGER IF EXISTS trg_ev_upd ON public.email_verifications;
CREATE TRIGGER trg_ev_upd BEFORE UPDATE ON public.email_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ar_upd ON public.approval_requests;
CREATE TRIGGER trg_ar_upd BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- Function to record apply evidence
-- =========================================================================
CREATE OR REPLACE FUNCTION public.record_apply_evidence(
  p_user_id uuid,
  p_application_id uuid,
  p_job_id uuid,
  p_provider text,
  p_evidence_type text,
  p_storage_path text DEFAULT NULL,
  p_content text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.apply_evidence (user_id, application_id, job_id, provider, evidence_type, storage_path, content, metadata)
  VALUES (p_user_id, p_application_id, p_job_id, p_provider, p_evidence_type, p_storage_path, p_content, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- =========================================================================
-- Function to create approval request
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_approval_request(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_callback_data text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.approval_requests (user_id, entity_type, entity_id, callback_data)
  VALUES (p_user_id, p_entity_type, p_entity_id, p_callback_data)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
