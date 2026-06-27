-- Telegram account binding — multi-user support
-- Each authenticated user can bind their own Telegram account

CREATE TABLE IF NOT EXISTS public.telegram_bindings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    telegram_user_id bigint NOT NULL,
    chat_id bigint NOT NULL,
    username text,
    first_name text,
    last_active_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id),
    UNIQUE(telegram_user_id),
    UNIQUE(chat_id)
);

ALTER TABLE public.telegram_bindings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_bindings TO authenticated;
GRANT ALL ON public.telegram_bindings TO service_role;

CREATE POLICY "tb_owner_select" ON public.telegram_bindings
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "tb_owner_insert" ON public.telegram_bindings
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "tb_owner_update" ON public.telegram_bindings
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "tb_owner_delete" ON public.telegram_bindings
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

CREATE INDEX idx_telegram_bindings_user ON public.telegram_bindings(user_id);
CREATE INDEX idx_telegram_bindings_chat ON public.telegram_bindings(chat_id);

-- One-time binding tokens (expiring)
CREATE TABLE IF NOT EXISTS public.telegram_binding_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    token text NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.telegram_binding_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_binding_tokens TO authenticated;
GRANT ALL ON public.telegram_binding_tokens TO service_role;

CREATE POLICY "tbt_owner_all" ON public.telegram_binding_tokens
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_telegram_binding_tokens_token ON public.telegram_binding_tokens(token);

-- workflow_state needs to be per-user
ALTER TABLE IF EXISTS public.workflow_state ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.workflow_state DROP CONSTRAINT IF EXISTS workflow_state_user_id_key;
ALTER TABLE IF EXISTS public.workflow_state ADD CONSTRAINT workflow_state_user_unique UNIQUE (user_id);

-- workflow_log needs user_id
ALTER TABLE IF EXISTS public.workflow_log ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.workflow_log ADD CONSTRAINT workflow_log_user_id_check CHECK (user_id IS NOT NULL);
