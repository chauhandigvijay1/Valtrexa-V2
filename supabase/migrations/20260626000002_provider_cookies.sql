-- Provider Cookies: single encrypted source of truth for all provider cookies

CREATE TABLE IF NOT EXISTS public.provider_cookies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL,
  cookie_value text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('valid','invalid','expired','pending','captcha_required','network_error','login_required')),
  health_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE public.provider_cookies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc owner" ON public.provider_cookies
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR auth.role() = 'service_role')
  WITH CHECK (user_id = auth.uid() OR auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_provider_cookies_user ON public.provider_cookies(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_cookies_provider ON public.provider_cookies(provider);

DROP TRIGGER IF EXISTS trg_pc_upd ON public.provider_cookies;
CREATE TRIGGER trg_pc_upd BEFORE UPDATE ON public.provider_cookies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.provider_cookies TO service_role, authenticated, anon;
