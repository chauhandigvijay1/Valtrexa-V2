-- Merge candidate_brain into candidate_profiles, add workflow_timeline & notifications

-- 1. Add candidate_brain columns to candidate_profiles (if missing)
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS remote_preference text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS salary_expectation numeric;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS career_goal text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS github_url text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS portfolio_url text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS preferred_roles jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS preferred_locations jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS primary_resume_id uuid REFERENCES public.resumes(id) ON DELETE SET NULL;

-- 2. Copy data from orphan candidate_brain to candidate_profiles
UPDATE public.candidate_profiles cp
SET
  name = cb.name,
  email = cb.email,
  phone = cb.phone,
  location = cb.location,
  remote_preference = COALESCE(cp.remote_preference, cb.remote_preference),
  salary_expectation = COALESCE(cp.salary_expectation, (cb.salary_expectations->>'min')::numeric),
  career_goal = COALESCE(cp.career_goal, cb.career_goals),
  github_url = COALESCE(cp.github_url, cb.github_url),
  linkedin_url = COALESCE(cp.linkedin_url, cb.linkedin_url),
  portfolio_url = COALESCE(cp.portfolio_url, cb.portfolio_url),
  preferred_roles = COALESCE(cp.preferred_roles, cb.preferred_roles),
  primary_resume_id = COALESCE(cp.primary_resume_id, cb.primary_resume_id)
FROM public.candidate_brain cb
WHERE cb.user_id = cp.user_id;

-- 3. Drop orphan candidate_brain table
DROP TABLE IF EXISTS public.candidate_brain CASCADE;

-- 4. Workflow Timeline table
CREATE TABLE IF NOT EXISTS public.workflow_timeline (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id uuid,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  label text,
  message text,
  progress integer DEFAULT 0,
  total integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.workflow_timeline ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_timeline TO authenticated;
GRANT ALL ON public.workflow_timeline TO service_role;
CREATE POLICY "wt_owner_all" ON public.workflow_timeline
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_workflow_timeline_user_cycle ON public.workflow_timeline(user_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_workflow_timeline_user_stage ON public.workflow_timeline(user_id, stage, started_at DESC);

-- 5. Notification Center table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  message text,
  severity text DEFAULT 'info',
  link text,
  read boolean DEFAULT false,
  telegram_sent boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  read_at timestamp with time zone
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
CREATE POLICY "notif_owner_all" ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON public.notifications(user_id, category, created_at DESC);
