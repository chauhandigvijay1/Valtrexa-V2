
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
