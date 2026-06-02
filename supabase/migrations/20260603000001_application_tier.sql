ALTER TABLE public.applications ADD COLUMN tier text CHECK (tier IN ('A', 'B', 'C', 'D'));
