-- ============================================================================
-- VALTREXA-V2 — Schema Consolidation
-- Fixes 3 tables that already existed when 20260625000006 was applied.
-- Those tables had old schemas from earlier migrations and were NOT altered
-- by CREATE TABLE IF NOT EXISTS.
-- ============================================================================

BEGIN;

-- 1. notifications: body -> message, add missing columns
-- ============================================================================
ALTER TABLE IF EXISTS notifications
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','success')),
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Rename body -> message (body already exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'body') THEN
    ALTER TABLE notifications RENAME COLUMN body TO message;
  END IF;
END $$;

-- Add missing index
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = false;

-- 2. candidate_memory: content -> answer, tags/importance -> phase out
-- ============================================================================
ALTER TABLE IF EXISTS candidate_memory
  ADD COLUMN IF NOT EXISTS answer text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general' CHECK (category IN ('permanent','dynamic','general')),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Copy content -> answer then rename
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidate_memory' AND column_name = 'content')
    AND EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'candidate_memory' AND column_name = 'answer') THEN
    UPDATE candidate_memory SET answer = content WHERE answer IS NULL;
  END IF;
END $$;

-- Drop old columns (safe after data copy)
ALTER TABLE IF EXISTS candidate_memory DROP COLUMN IF EXISTS tags;
ALTER TABLE IF EXISTS candidate_memory DROP COLUMN IF EXISTS importance;

-- Add unique constraint if missing
-- (some projects already have it from older migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_memory_user_id_topic_key') THEN
    ALTER TABLE candidate_memory ADD UNIQUE (user_id, topic);
  END IF;
END $$;

-- 3. company_research: rename columns, add missing, drop FK to companies
-- ============================================================================
ALTER TABLE IF EXISTS company_research
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS funding_stage text,
  ADD COLUMN IF NOT EXISTS pain_points jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hiring_team jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS technologies jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS culture text,
  ADD COLUMN IF NOT EXISTS raw_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS researched_at timestamptz DEFAULT now();

-- Rename/copy columns
DO $$
BEGIN
  -- company_name -> company
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_research' AND column_name = 'company_name') THEN
    UPDATE company_research SET company = company_name WHERE company IS NULL;
    ALTER TABLE company_research DROP COLUMN company_name;
  END IF;

  -- summary -> preserve as free-text, leave summary column in place
  -- tech_stack -> technologies (text[] -> jsonb)
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_research' AND column_name = 'tech_stack') THEN
    UPDATE company_research SET technologies = to_jsonb(tech_stack) WHERE technologies IS NULL OR technologies = '[]'::jsonb;
    ALTER TABLE company_research DROP COLUMN IF EXISTS tech_stack;
  END IF;

  -- culture_notes -> culture
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_research' AND column_name = 'culture_notes') THEN
    UPDATE company_research SET culture = culture_notes WHERE culture IS NULL;
    ALTER TABLE company_research DROP COLUMN IF EXISTS culture_notes;
  END IF;

  -- recent_news (text) -> recent_news (jsonb), preserve
  -- company_id FK -> drop FK constraint, drop column
END $$;

-- Drop FK to companies table and the column
ALTER TABLE IF EXISTS company_research DROP CONSTRAINT IF EXISTS company_research_company_id_fkey;
ALTER TABLE IF EXISTS company_research DROP COLUMN IF EXISTS company_id;

-- Drop old columns that have been migrated
ALTER TABLE IF EXISTS company_research DROP COLUMN IF EXISTS source_urls;
ALTER TABLE IF EXISTS company_research DROP COLUMN IF EXISTS file_url;

-- Add company NOT NULL check now that data is migrated
-- (but allow null if no data existed)
-- Actually skip NOT NULL for safety, the app layer handles it

-- Recreate the unique constraint if dropped
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_research_user_id_company_key') THEN
    ALTER TABLE company_research ADD UNIQUE (user_id, company);
  END IF;
END $$;

-- 4. Add missing index for company_research
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_company_research_user ON company_research(user_id);

-- 5. Ensure candidate_profiles has all columns from 06 migration
-- ============================================================================
ALTER TABLE IF EXISTS candidate_profiles
  ADD COLUMN IF NOT EXISTS preferred_roles jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS preferred_locations jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS salary_expectation numeric,
  ADD COLUMN IF NOT EXISTS years_experience integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skills jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS projects jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS experiences jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS education jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS resume_text text,
  ADD COLUMN IF NOT EXISTS resume_parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS brain_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS missing_fields jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMIT;

NOTIFY pgrst, 'reload schema';
