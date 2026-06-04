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
