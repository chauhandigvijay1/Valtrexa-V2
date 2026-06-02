ALTER TABLE public.companies ADD COLUMN target_value text DEFAULT 'normal' CHECK (target_value IN ('normal', 'high'));
