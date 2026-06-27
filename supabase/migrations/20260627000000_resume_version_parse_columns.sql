-- Resume Version Parse Result & Confidence Score
-- Adds parse_result and confidence_score columns to resume_versions

ALTER TABLE IF EXISTS public.resume_versions
  ADD COLUMN IF NOT EXISTS parse_result jsonb;

ALTER TABLE IF EXISTS public.resume_versions
  ADD COLUMN IF NOT EXISTS confidence_score real;
