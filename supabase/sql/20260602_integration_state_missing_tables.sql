-- Career Compass Pro: missing integration state tables
-- Paste this entire file into the Supabase SQL Editor and run after the release schema migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.platform_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  credential_label text NOT NULL DEFAULT 'default',
  secret_ciphertext text NOT NULL,
  secret_iv text,
  secret_tag text,
  key_version text NOT NULL DEFAULT 'v1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_credentials_provider_not_blank CHECK (length(trim(provider)) > 0),
  CONSTRAINT platform_credentials_label_not_blank CHECK (length(trim(credential_label)) > 0),
  CONSTRAINT platform_credentials_user_provider_label_key UNIQUE (user_id, provider, credential_label)
);
ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_credentials owner all" ON public.platform_credentials;
CREATE POLICY "platform_credentials owner all" ON public.platform_credentials FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_credentials TO authenticated;
GRANT ALL ON public.platform_credentials TO service_role;
CREATE INDEX IF NOT EXISTS idx_platform_credentials_user_provider ON public.platform_credentials(user_id, provider);
DROP TRIGGER IF EXISTS trg_platform_credentials_updated ON public.platform_credentials;
CREATE TRIGGER trg_platform_credentials_updated BEFORE UPDATE ON public.platform_credentials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  account_identifier text NOT NULL DEFAULT 'primary',
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text,
  token_type text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  expires_at timestamptz,
  last_refreshed_at timestamptz,
  key_version text NOT NULL DEFAULT 'v1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_tokens_provider_not_blank CHECK (length(trim(provider)) > 0),
  CONSTRAINT oauth_tokens_account_identifier_not_blank CHECK (length(trim(account_identifier)) > 0),
  CONSTRAINT oauth_tokens_user_provider_account_key UNIQUE (user_id, provider, account_identifier)
);
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oauth_tokens owner all" ON public.oauth_tokens;
CREATE POLICY "oauth_tokens owner all" ON public.oauth_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_tokens TO authenticated;
GRANT ALL ON public.oauth_tokens TO service_role;
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider ON public.oauth_tokens(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON public.oauth_tokens(expires_at);
DROP TRIGGER IF EXISTS trg_oauth_tokens_updated ON public.oauth_tokens;
CREATE TRIGGER trg_oauth_tokens_updated BEFORE UPDATE ON public.oauth_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.browser_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  profile_name text NOT NULL,
  session_state_ciphertext text NOT NULL,
  key_version text NOT NULL DEFAULT 'v1',
  user_agent text,
  last_validated_at timestamptz,
  last_rotated_at timestamptz,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT browser_sessions_provider_not_blank CHECK (length(trim(provider)) > 0),
  CONSTRAINT browser_sessions_profile_name_not_blank CHECK (length(trim(profile_name)) > 0),
  CONSTRAINT browser_sessions_valid_status CHECK (status IN ('active', 'expired', 'revoked', 'invalid')),
  CONSTRAINT browser_sessions_user_provider_profile_key UNIQUE (user_id, provider, profile_name)
);
ALTER TABLE public.browser_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "browser_sessions owner all" ON public.browser_sessions;
CREATE POLICY "browser_sessions owner all" ON public.browser_sessions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.browser_sessions TO authenticated;
GRANT ALL ON public.browser_sessions TO service_role;
CREATE INDEX IF NOT EXISTS idx_browser_sessions_user_provider ON public.browser_sessions(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_status ON public.browser_sessions(status, expires_at);
DROP TRIGGER IF EXISTS trg_browser_sessions_updated ON public.browser_sessions;
CREATE TRIGGER trg_browser_sessions_updated BEFORE UPDATE ON public.browser_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date date NOT NULL DEFAULT CURRENT_DATE,
  summary_text text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_summaries_user_date_key UNIQUE (user_id, summary_date)
);
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_summaries owner all" ON public.daily_summaries;
CREATE POLICY "daily_summaries owner all" ON public.daily_summaries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_summaries TO authenticated;
GRANT ALL ON public.daily_summaries TO service_role;
CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date ON public.daily_summaries(user_id, summary_date);

CREATE OR REPLACE FUNCTION public.enqueue_daily_summary_workflow_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.workflow_events (user_id, event_type, entity_type, entity_id, payload)
  VALUES (NEW.user_id, 'daily_summary_ready', 'daily_summaries', NEW.id, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_summaries_workflow_event ON public.daily_summaries;
CREATE TRIGGER trg_daily_summaries_workflow_event
AFTER INSERT ON public.daily_summaries
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_daily_summary_workflow_event();

COMMIT;
