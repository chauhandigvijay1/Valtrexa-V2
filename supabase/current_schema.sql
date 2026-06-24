-- ====================================================
-- VALTREXA-V2 — Current Schema Snapshot
-- Generated: 2026-06-24 13:31:18 UTC
-- Method: Full concatenation of all 19 migration files in order
-- Purpose: Reference snapshot of the final schema state
-- WARNING: Do NOT apply this file directly. Use individual migrations.
-- ====================================================


-- ====================================================
-- Migration: 20260529133833_e05b8da4-068b-4844-a2bd-ee03555472e4.sql
-- ====================================================


-- ENUMS
CREATE TYPE app_role AS ENUM ('admin', 'user');
CREATE TYPE skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
CREATE TYPE remote_pref AS ENUM ('remote', 'hybrid', 'onsite', 'any');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'internship', 'freelance');
CREATE TYPE application_status AS ENUM ('saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'accepted');
CREATE TYPE job_status AS ENUM ('open', 'closed', 'saved', 'archived');
CREATE TYPE job_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE interview_status AS ENUM ('scheduled', 'completed', 'cancelled', 'rescheduled');
CREATE TYPE outreach_status AS ENUM ('draft', 'sent', 'replied', 'no_response', 'bounced');

-- TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Generic helper to standardize owner table creation
-- We'll inline RLS per table.

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,
  headline text,
  location text,
  bio text,
  github_url text,
  linkedin_url text,
  portfolio_url text,
  website_url text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles owner all" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CANDIDATE PROFILES (extended)
CREATE TABLE public.candidate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  years_experience int DEFAULT 0,
  current_title text,
  current_company text,
  open_to_work boolean DEFAULT true,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_profiles TO authenticated;
GRANT ALL ON public.candidate_profiles TO service_role;
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp owner all" ON public.candidate_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_cp_upd BEFORE UPDATE ON public.candidate_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SKILLS
CREATE TABLE public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  level skill_level NOT NULL DEFAULT 'intermediate',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skills TO authenticated;
GRANT ALL ON public.skills TO service_role;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skills owner all" ON public.skills FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- PROJECTS
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  github_url text,
  live_url text,
  tech_stack text[] DEFAULT '{}',
  impact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects owner all" ON public.projects FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_projects_upd BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EXPERIENCES
CREATE TABLE public.experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company text NOT NULL,
  title text NOT NULL,
  location text,
  start_date date,
  end_date date,
  is_current boolean DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experiences TO authenticated;
GRANT ALL ON public.experiences TO service_role;
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exp owner all" ON public.experiences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- EDUCATION
CREATE TABLE public.education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school text NOT NULL,
  degree text,
  field text,
  start_date date,
  end_date date,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.education TO authenticated;
GRANT ALL ON public.education TO service_role;
ALTER TABLE public.education ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edu owner all" ON public.education FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- RESUMES
CREATE TABLE public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resumes owner all" ON public.resumes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_resumes_upd BEFORE UPDATE ON public.resumes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RESUME VERSIONS
CREATE TABLE public.resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  file_url text,
  content text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_versions TO authenticated;
GRANT ALL ON public.resume_versions TO service_role;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rv owner all" ON public.resume_versions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- JOB PREFERENCES
CREATE TABLE public.job_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_roles text[] DEFAULT '{}',
  countries text[] DEFAULT '{}',
  remote_preference remote_pref DEFAULT 'any',
  min_salary numeric,
  max_salary numeric,
  currency text DEFAULT 'USD',
  employment_types employment_type[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_preferences TO authenticated;
GRANT ALL ON public.job_preferences TO service_role;
ALTER TABLE public.job_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jp owner all" ON public.job_preferences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_jp_upd BEFORE UPDATE ON public.job_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COMPANIES
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  website text,
  industry text,
  size text,
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies owner all" ON public.companies FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- JOBS
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  title text NOT NULL,
  company_name text,
  location text,
  url text,
  source text,
  salary_range text,
  description text,
  status job_status NOT NULL DEFAULT 'open',
  priority job_priority NOT NULL DEFAULT 'medium',
  match_score int DEFAULT 0,
  saved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs owner all" ON public.jobs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_jobs_upd BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- APPLICATIONS
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  resume_version_id uuid REFERENCES public.resume_versions(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  role_title text NOT NULL,
  status application_status NOT NULL DEFAULT 'applied',
  applied_at timestamptz DEFAULT now(),
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apps owner all" ON public.applications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_apps_upd BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- APPLICATION EVENTS
CREATE TABLE public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ae owner all" ON public.application_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- RECRUITERS
CREATE TABLE public.recruiters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  linkedin_url text,
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiters TO authenticated;
GRANT ALL ON public.recruiters TO service_role;
ALTER TABLE public.recruiters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec owner all" ON public.recruiters FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_rec_upd BEFORE UPDATE ON public.recruiters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- OUTREACH CAMPAIGNS
CREATE TABLE public.outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  template text,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaigns TO authenticated;
GRANT ALL ON public.outreach_campaigns TO service_role;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oc owner all" ON public.outreach_campaigns FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_oc_upd BEFORE UPDATE ON public.outreach_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- OUTREACH MESSAGES
CREATE TABLE public.outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE SET NULL,
  subject text,
  body text,
  status outreach_status NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_messages TO authenticated;
GRANT ALL ON public.outreach_messages TO service_role;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "om owner all" ON public.outreach_messages FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- INTERVIEWS
CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  role_title text,
  round text,
  interviewer text,
  scheduled_at timestamptz,
  status interview_status NOT NULL DEFAULT 'scheduled',
  meeting_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iv owner all" ON public.interviews FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_iv_upd BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- INTERVIEW PREPARATION
CREATE TABLE public.interview_preparation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE CASCADE,
  topic text NOT NULL,
  notes text,
  resources text[],
  completed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_preparation TO authenticated;
GRANT ALL ON public.interview_preparation TO service_role;
ALTER TABLE public.interview_preparation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip owner all" ON public.interview_preparation FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ANALYTICS (daily snapshots)
CREATE TABLE public.analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  metric text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics TO authenticated;
GRANT ALL ON public.analytics TO service_role;
ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "an owner all" ON public.analytics FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  read boolean DEFAULT false,
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif owner all" ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- INTEGRATIONS (third-party config storage)
CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  enabled boolean DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "int owner all" ON public.integrations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_int_upd BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ACTIVITY LOGS
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "al owner all" ON public.activity_logs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- SETTINGS
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text DEFAULT 'dark',
  email_notifications boolean DEFAULT true,
  weekly_digest boolean DEFAULT true,
  timezone text DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "set owner all" ON public.settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_set_upd BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ====================================================
-- Migration: 20260529133900_d8c71c6c-0a32-4a45-84ce-7721a671b505.sql
-- ====================================================


CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;


-- ====================================================
-- Migration: 20260529133925_0b4348a5-51b0-491f-aacc-e1bdc9332ebd.sql
-- ====================================================

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;

-- ====================================================
-- Migration: 20260529140546_ab2d62c2-a2f5-4c7f-a576-8b41adec3af7.sql
-- ====================================================


-- ============== NEW TABLES ==============

CREATE TABLE public.candidate_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic text NOT NULL,
  content text NOT NULL,
  tags text[] DEFAULT '{}',
  importance int NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_memory TO authenticated;
GRANT ALL ON public.candidate_memory TO service_role;
ALTER TABLE public.candidate_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm owner all" ON public.candidate_memory FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_candidate_memory_user ON public.candidate_memory(user_id);
CREATE TRIGGER trg_cm_updated BEFORE UPDATE ON public.candidate_memory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.recruiter_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE CASCADE,
  channel text,
  subject text,
  last_message_at timestamptz,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiter_conversations TO authenticated;
GRANT ALL ON public.recruiter_conversations TO service_role;
ALTER TABLE public.recruiter_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rc owner all" ON public.recruiter_conversations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_rc_user ON public.recruiter_conversations(user_id);
CREATE INDEX idx_rc_recruiter ON public.recruiter_conversations(recruiter_id);
CREATE TRIGGER trg_rc_updated BEFORE UPDATE ON public.recruiter_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE SET NULL,
  due_at timestamptz NOT NULL,
  note text,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followups TO authenticated;
GRANT ALL ON public.followups TO service_role;
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fu owner all" ON public.followups FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_followups_user ON public.followups(user_id);
CREATE INDEX idx_followups_due ON public.followups(due_at);
CREATE TRIGGER trg_followups_updated BEFORE UPDATE ON public.followups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text,
  status text NOT NULL DEFAULT 'pending',
  due_at timestamptz,
  url text,
  notes text,
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "as owner all" ON public.assessments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_assessments_user ON public.assessments(user_id);
CREATE TRIGGER trg_assessments_updated BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.painpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name text,
  title text NOT NULL,
  description text,
  source_url text,
  severity int NOT NULL DEFAULT 3,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.painpoints TO authenticated;
GRANT ALL ON public.painpoints TO service_role;
ALTER TABLE public.painpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp owner all" ON public.painpoints FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_painpoints_user ON public.painpoints(user_id);
CREATE TRIGGER trg_painpoints_updated BEFORE UPDATE ON public.painpoints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.company_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  summary text,
  recent_news text,
  tech_stack text[] DEFAULT '{}',
  culture_notes text,
  source_urls text[] DEFAULT '{}',
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_research TO authenticated;
GRANT ALL ON public.company_research TO service_role;
ALTER TABLE public.company_research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr owner all" ON public.company_research FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_cr_user ON public.company_research(user_id);
CREATE TRIGGER trg_cr_updated BEFORE UPDATE ON public.company_research FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  provider text,
  model text,
  prompt text,
  response text,
  related_entity text,
  related_id uuid,
  tokens_input int,
  tokens_output int,
  cost numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_generations TO authenticated;
GRANT ALL ON public.ai_generations TO service_role;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aig owner all" ON public.ai_generations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_aig_user ON public.ai_generations(user_id);

CREATE TABLE public.telegram_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_id text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_notifications TO authenticated;
GRANT ALL ON public.telegram_notifications TO service_role;
ALTER TABLE public.telegram_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tn owner all" ON public.telegram_notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_tn_user ON public.telegram_notifications(user_id);

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ae2 owner all" ON public.analytics_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_aev_user ON public.analytics_events(user_id);
CREATE INDEX idx_aev_name ON public.analytics_events(event_name);

CREATE TABLE public.learning_loop (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  insight text NOT NULL,
  action text,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_loop TO authenticated;
GRANT ALL ON public.learning_loop TO service_role;
ALTER TABLE public.learning_loop ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ll owner all" ON public.learning_loop FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_ll_user ON public.learning_loop(user_id);
CREATE TRIGGER trg_ll_updated BEFORE UPDATE ON public.learning_loop FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  score int NOT NULL DEFAULT 0,
  reasons text,
  skills_matched text[] DEFAULT '{}',
  skills_missing text[] DEFAULT '{}',
  recommended_resume_id uuid REFERENCES public.resumes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_matches TO authenticated;
GRANT ALL ON public.job_matches TO service_role;
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jm owner all" ON public.job_matches FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_jm_user ON public.job_matches(user_id);
CREATE INDEX idx_jm_job ON public.job_matches(job_id);
CREATE TRIGGER trg_jm_updated BEFORE UPDATE ON public.job_matches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== FK + INDEX additions on EXISTING tables ==============

ALTER TABLE public.applications
  ADD CONSTRAINT applications_job_fk FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD CONSTRAINT applications_resume_version_fk FOREIGN KEY (resume_version_id) REFERENCES public.resume_versions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_applications_user ON public.applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);

ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_application_fk FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_interviews_user ON public.interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled ON public.interviews(scheduled_at);

ALTER TABLE public.interview_preparation
  ADD CONSTRAINT ip_interview_fk FOREIGN KEY (interview_id) REFERENCES public.interviews(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ip_user ON public.interview_preparation(user_id);

ALTER TABLE public.outreach_messages
  ADD CONSTRAINT om_campaign_fk FOREIGN KEY (campaign_id) REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  ADD CONSTRAINT om_recruiter_fk FOREIGN KEY (recruiter_id) REFERENCES public.recruiters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_om_user ON public.outreach_messages(user_id);

ALTER TABLE public.resume_versions
  ADD CONSTRAINT rv_resume_fk FOREIGN KEY (resume_id) REFERENCES public.resumes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_rv_resume ON public.resume_versions(resume_id);

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_user ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);

-- ============== STORAGE BUCKETS ==============

INSERT INTO storage.buckets (id, name, public) VALUES
  ('resumes','resumes',false),
  ('tailored-resumes','tailored-resumes',false),
  ('documents','documents',false),
  ('company-research','company-research',false)
ON CONFLICT (id) DO NOTHING;

-- Per-user folder policies: first path segment must equal the auth uid
CREATE POLICY "user files select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('resumes','tailored-resumes','documents','company-research')
         AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('resumes','tailored-resumes','documents','company-research')
              AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user files update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('resumes','tailored-resumes','documents','company-research')
         AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('resumes','tailored-resumes','documents','company-research')
         AND auth.uid()::text = (storage.foldername(name))[1]);


-- ====================================================
-- Migration: 20260529152000_ai_career_os.sql
-- ====================================================

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


-- ====================================================
-- Migration: 20260530001000_pre_n8n_readiness.sql
-- ====================================================

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


-- ====================================================
-- Migration: 20260531030000_pre_n8n_release_final.sql
-- ====================================================

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


-- ====================================================
-- Migration: 20260603000000_candidate_brain.sql
-- ====================================================

CREATE TABLE public.candidate_brain (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    
    name text,
    email text,
    phone text,
    location text,
    remote_preference text,
    salary_expectations jsonb,
    communication_style text,
    career_goals text,

    skills jsonb DEFAULT '[]'::jsonb,
    projects jsonb DEFAULT '[]'::jsonb,
    education jsonb DEFAULT '[]'::jsonb,
    certifications jsonb DEFAULT '[]'::jsonb,
    achievements jsonb DEFAULT '[]'::jsonb,
    preferred_roles jsonb DEFAULT '[]'::jsonb,
    
    github_url text,
    linkedin_url text,
    portfolio_url text,
    
    primary_resume_id uuid REFERENCES public.resumes(id) ON DELETE SET NULL,

    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

ALTER TABLE public.candidate_brain ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_brain TO authenticated;
GRANT ALL ON public.candidate_brain TO service_role;

CREATE POLICY "cb_owner_all" ON public.candidate_brain 
FOR ALL TO authenticated 
USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_cb_upd BEFORE UPDATE ON public.candidate_brain FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ====================================================
-- Migration: 20260603000001_application_tier.sql
-- ====================================================

ALTER TABLE public.applications ADD COLUMN tier text CHECK (tier IN ('A', 'B', 'C', 'D'));


-- ====================================================
-- Migration: 20260603000002_company_target_value.sql
-- ====================================================

ALTER TABLE public.companies ADD COLUMN target_value text DEFAULT 'normal' CHECK (target_value IN ('normal', 'high'));


-- ====================================================
-- Migration: 20260604000000_latex_pdf_path.sql
-- ====================================================

ALTER TABLE public.tailored_resumes ADD COLUMN IF NOT EXISTS pdf_storage_path text;


-- ====================================================
-- Migration: 20260604000002_fix_workflow_events_trigger.sql
-- ====================================================

-- Migration: Fix workflow_events trigger to use SECURITY DEFINER
-- Without this, database triggers that insert into workflow_events
-- silently fail when RLS policies block the authenticated user context.

-- First, check if the function exists and recreate with SECURITY DEFINER
DO $$
BEGIN
  -- Only proceed if the function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'enqueue_direct_crud_workflow_event'
  ) THEN
    -- Drop and recreate with SECURITY DEFINER
    EXECUTE '
      CREATE OR REPLACE FUNCTION enqueue_direct_crud_workflow_event()
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
        IF TG_OP = ''INSERT'' THEN
          event_kind := entity_kind || ''_created'';
        ELSIF TG_OP = ''UPDATE'' THEN
          event_kind := entity_kind || ''_updated'';
        ELSIF TG_OP = ''DELETE'' THEN
          event_kind := entity_kind || ''_deleted'';
        END IF;

         INSERT INTO workflow_events (event_type, entity_id, entity_type, user_id, payload)
         VALUES (
           event_kind,
           COALESCE(NEW.id, OLD.id)::TEXT,
           entity_kind,
           COALESCE(NEW.user_id, OLD.user_id),
           jsonb_build_object(
             ''operation'', TG_OP,
             ''table'', TG_TABLE_NAME,
             ''timestamp'', now()
           )
         );

        RETURN COALESCE(NEW, OLD);
      END;
      $fn$;
    ';
  END IF;
END;
$$;


-- ====================================================
-- Migration: 20260604100000_phase_recovery.sql
-- ====================================================

-- Phase Recovery: Create missing tables and enhance existing ones

-------------------------------------------------------------
-- 1. application_answers â€” stores AI-generated Q&A for apps
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


-- ====================================================
-- Migration: 20260605000000_candidate_brain_expansion.sql
-- ====================================================

-- Candidate Brain Expansion, Recruiter Discovery, and High Value Engine database schema updates

-- 1. Create certifications table
CREATE TABLE IF NOT EXISTS public.certifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    issuer text,
    date text,
    summary text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "certifications owner all" ON public.certifications;
CREATE POLICY "certifications owner all" ON public.certifications
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.certifications TO authenticated;
GRANT ALL ON public.certifications TO service_role;

-- 2. Add Candidate Brain missing profile columns
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS communication_style text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS resume_raw_text text;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS parsed_resume jsonb;

-- 3. Add Recruiter missing columns
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS profile_url text;

-- 4. Add Company founder detection column
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS founder_detected boolean DEFAULT false;


-- ====================================================
-- Migration: 20260607090000_resume_sync_and_job_filters.sql
-- ====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS features text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.resume_parses
  ADD COLUMN IF NOT EXISTS confidence_score double precision;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS normalized_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS work_mode text,
  ADD COLUMN IF NOT EXISTS salary_min integer,
  ADD COLUMN IF NOT EXISTS salary_max integer,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS freshness_bucket text,
  ADD COLUMN IF NOT EXISTS easy_apply boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_jobs_experience_level ON public.jobs(experience_level);
CREATE INDEX IF NOT EXISTS idx_jobs_work_mode ON public.jobs(work_mode);
CREATE INDEX IF NOT EXISTS idx_jobs_company_size ON public.jobs(company_size);
CREATE INDEX IF NOT EXISTS idx_jobs_freshness_bucket ON public.jobs(freshness_bucket);
CREATE INDEX IF NOT EXISTS idx_jobs_easy_apply ON public.jobs(easy_apply);
CREATE INDEX IF NOT EXISTS idx_jobs_salary_min ON public.jobs(salary_min);
CREATE INDEX IF NOT EXISTS idx_jobs_salary_max ON public.jobs(salary_max);
CREATE INDEX IF NOT EXISTS idx_jobs_normalized_roles ON public.jobs USING gin(normalized_roles);


-- ====================================================
-- Migration: 20260622000000_phase_a_b_engine_completion.sql
-- ====================================================

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
-- A2/A4: Jobs enrichment â€” freshness score, application metadata
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
-- A4: Match Engine â€” multi-factor score decomposition
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
-- A5: High Value Engine â€” strategic value scoring
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
-- A6: Recruiter Discovery Engine â€” confidence + verification
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
-- A7: Apply Engine â€” primary-resume-only application packages
-- =========================================================================
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS tier text;           -- A | B | C | D
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS match_score integer;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS package_generated boolean DEFAULT false;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS primary_resume_id uuid;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- =========================================================================
-- A8: Batch Apply Engine â€” queue-driven batches
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
-- A10: Followup Engine â€” cadence metadata
-- =========================================================================
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS recruiter_id uuid;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS cadence text;   -- day_3 | day_7 | day_14 | custom
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS sequence_index integer;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS body text;

-- =========================================================================
-- A11: Inbox Intelligence â€” Gmail OAuth + classification
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
-- B1: Playwright Platform â€” persistent sessions + storage states
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
-- B2/B3: Queue jobs â€” BullMQ job audit trail (mirrored from Redis for visibility)
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
-- B4: Event Bus â€” delivery history + consumer registry
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


-- ====================================================
-- Migration: 20260622000001_phase_p1_p8_completion.sql
-- ====================================================

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


-- ====================================================
-- Migration: 20260625000000_comprehensive_schema_fix.sql
-- ====================================================

-- =============================================================================
-- COMPREHENSIVE SCHEMA MIGRATION â€” based on REAL PRODUCTION DATABASE STATE
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

-- 7. gmail_messages (telegram.ts analytics â€” counts by classification)
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


-- ====================================================
-- Migration: 20260625000001_provider_controls.sql
-- ====================================================

-- Provider Controls: enable/disable/pause/maintenance per provider
CREATE TABLE IF NOT EXISTS public.provider_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled','paused','maintenance')),
  failure_count integer DEFAULT 0,
  consecutive_failures integer DEFAULT 0,
  last_failure_at timestamptz,
  last_failure_reason text,
  last_success_at timestamptz,
  disabled_by text,
  disabled_at timestamptz,
  auto_disabled boolean DEFAULT false,
  auto_recovery_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_controls TO authenticated;
GRANT ALL ON public.provider_controls TO service_role;
ALTER TABLE public.provider_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc admin all" ON public.provider_controls;
CREATE POLICY "pc admin all" ON public.provider_controls FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_pc_upd ON public.provider_controls;
CREATE TRIGGER trg_pc_upd BEFORE UPDATE ON public.provider_controls FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Insert default provider rows
INSERT INTO public.provider_controls (provider, status) VALUES
  ('linkedin', 'enabled'),
  ('indeed', 'enabled'),
  ('naukri', 'enabled'),
  ('wellfound', 'enabled'),
  ('instahyre', 'enabled')
ON CONFLICT (provider) DO NOTHING;

-- Provider health log for tracking failures, recoveries, and state changes
CREATE TABLE IF NOT EXISTS public.provider_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('failure','recovery','disabled','enabled','paused','resumed','maintenance','warning','info')),
  severity text DEFAULT 'info' CHECK (severity IN ('critical','warning','info')),
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_health_log TO authenticated;
GRANT ALL ON public.provider_health_log TO service_role;
ALTER TABLE public.provider_health_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "phl admin all" ON public.provider_health_log;
CREATE POLICY "phl admin all" ON public.provider_health_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_phl_provider_event ON public.provider_health_log (provider, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phl_created ON public.provider_health_log (created_at DESC);

-- Provider challenge registry (known failure patterns)
CREATE TABLE IF NOT EXISTS public.provider_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  challenge_type text NOT NULL,
  description text,
  symptom_pattern text,
  detection_logic text,
  recovery_steps jsonb DEFAULT '[]'::jsonb,
  fallback_strategy text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_challenges TO authenticated;
GRANT ALL ON public.provider_challenges TO service_role;
ALTER TABLE public.provider_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pch admin all" ON public.provider_challenges;
CREATE POLICY "pch admin all" ON public.provider_challenges FOR ALL TO authenticated USING (true) WITH CHECK (true);

