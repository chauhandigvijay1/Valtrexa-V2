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
