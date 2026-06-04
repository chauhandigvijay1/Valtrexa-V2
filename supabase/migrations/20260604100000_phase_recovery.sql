-- Phase Recovery: Create missing tables and enhance existing ones

-------------------------------------------------------------
-- 1. application_answers — stores AI-generated Q&A for apps
-------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  source text NOT NULL DEFAULT 'ai',
  confidence numeric(3,2) DEFAULT 0.85,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "application_answers owner all" ON public.application_answers;
CREATE POLICY "application_answers owner all" ON public.application_answers
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_answers TO authenticated;
GRANT ALL ON public.application_answers TO service_role;

CREATE INDEX IF NOT EXISTS idx_application_answers_user ON public.application_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_application_answers_app ON public.application_answers(application_id);

DROP TRIGGER IF EXISTS trg_application_answers_updated ON public.application_answers;
CREATE TRIGGER trg_application_answers_updated
  BEFORE UPDATE ON public.application_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-------------------------------------------------------------
-- 2. Add recruiter_id to follow_ups for recruiter tracking
-------------------------------------------------------------
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE SET NULL;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS body text;

-------------------------------------------------------------
-- 3. Add interview_id FK to interview_preparation if missing
-------------------------------------------------------------
-- interview_preparation already exists, ensure it has the right columns
ALTER TABLE public.interview_preparation ADD COLUMN IF NOT EXISTS resources text[];

-------------------------------------------------------------
-- 4. Enhance recruiters with discovery metadata
-------------------------------------------------------------
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS discovered_via text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS relevance_score numeric(3,2) DEFAULT 0;

-------------------------------------------------------------
-- 5. Add feedback columns to interviews
-------------------------------------------------------------
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS feedback text;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS rating integer;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS outcome text;
