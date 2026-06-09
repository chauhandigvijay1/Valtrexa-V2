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
