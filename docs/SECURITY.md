# Security — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29

## Authentication

VALTREXA-V2 uses **Supabase Auth** with two methods:

| Method           | Use Case           | Status                               |
| ---------------- | ------------------ | ------------------------------------ |
| Email + Password | Traditional signup | Requires email confirmation          |
| Google OAuth     | One-click signup   | Uses state param for CSRF protection |

### Signup Flow Security

1. Password is hashed by Supabase (bcrypt)
2. Email confirmation is **enabled** — user must click verification link
3. Rate limited via `safeRouteRequest` (100 req/60s/IP)
4. On signup, a profile is created in `profiles` table via `supabaseAdmin` (service role)

### OAuth Flow Security

1. **State parameter**: `crypto.randomUUID()` generated client-side, stored in `sessionStorage`
2. Passed as `queryParams.state` in `signInWithOAuth()`
3. On callback, the returned `state` is compared to the stored value
4. Mismatch → toast error + redirect to `/login` (prevents CSRF)
5. Redirect URL: `https://valtrexa-v2.vercel.app/auth/callback`

### Session Management

- Supabase session tokens (JWT) with configurable expiry
- `requireApiUser` middleware validates on every API request
- **Email-only users**: 403 returned if `email_confirmed_at` is null (unconfirmed)
- OAuth users bypass the email confirmation check

## Service Role Key

- `SUPABASE_SERVICE_ROLE_KEY` used server-side only (API routes, workers)
- Bypasses Row Level Security (RLS) — all queries must include `user_id` filter
- All server-to-database operations are scoped via `.eq("user_id", userId)`
- **145+ write operations audited**: 0 unscoped writes found

## Row Level Security (RLS)

All user-scoped tables enforce RLS:

| Table              | Policy                 | Effect                              |
| ------------------ | ---------------------- | ----------------------------------- |
| `profiles`         | `id = auth.uid()`      | User can only access own profile    |
| `applications`     | `user_id = auth.uid()` | User can only see own applications  |
| `candidate_memory` | `user_id = auth.uid()` | User can only see own memory        |
| `provider_cookies` | `user_id = auth.uid()` | User can only see own cookies       |
| `notifications`    | `user_id = auth.uid()` | User can only see own notifications |
| All others         | Same pattern           | Consistent per-user isolation       |

Service role client bypasses RLS but enforces user scoping in code.

## Webhook Security

### Telegram Webhook

- **Secret token**: `TELEGRAM_WEBHOOK_SECRET` compared against `x-telegram-bot-api-secret-token` header
- **Per-chat rate limit**: Max 10 requests per 3 seconds per chat ID (in-memory)
- **Global rate limit**: All routes, including webhook, are rate-limited by `safeRouteRequest`
- **No env-var fallback**: The legacy `TELEGRAM_USER_ID` env var is no longer used for inbound resolution. Each user must bind via `/connect`. Unbound chats receive a "not connected" response.
- **User mapping**: `resolveUserIdFromTelegramChat` queries `telegram_bindings` table by `chat_id`. Returns `""` for unbound chats — all command handlers check for empty userId before processing.
- Without the secret token, requests are accepted but rate-limited

### Webhook URL

`https://valtrexa-v2.vercel.app/api/telegram/webhook`

## Environment Variable Security

| What                        | How It's Protected                                  |
| --------------------------- | --------------------------------------------------- |
| `SESSION_SECRET`            | Stored in Vercel env, never exposed to client       |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, RLS bypass requires careful scoping    |
| `COOKIE_ENCRYPTION_KEY`     | Must be set in production — empty key is detectable |
| `GMAIL_CLIENT_SECRET`       | Stored in Vercel env, server-only                   |
| `GMAIL_REFRESH_TOKEN`       | Single-mailbox token, server-only                   |
| `TELEGRAM_BOT_TOKEN`        | Stored in Vercel env, server-only                   |

## Provider Cookie Encryption

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key derivation**: SHA-256(`COOKIE_ENCRYPTION_KEY`)
- **IV**: Random 16 bytes per encryption
- **Storage**: Hex-encoded `iv:authTag:ciphertext` in `provider_cookies.cookie_value`
- **Rotation**: User re-pastes cookies; old encrypted blob is overwritten

⚠️ **Without `COOKIE_ENCRYPTION_KEY`**, the key is SHA-256("") which is a known constant. Always set a strong random value.

## Rate Limiting

- **In-memory, IP-based**: 100 requests per 60-second window (configurable)
- **Applied globally**: All API routes pass through `safeRouteRequest`
- **Telegram webhook**: Additional per-chat limit (10 req / 3s)
- **Limit exceeded**: HTTP 429 with `retry-after` header

## Input Validation

- All API payloads parsed via `readJson<T>()`
- Required fields checked, invalid requests rejected with 400
- SQL injection prevented by Supabase JS client (parameterized queries)
- IDOR prevented by mandatory `user_id` filters in all queries

## Encryption Key Storage

| Key                       | Storage        | Rotation                               |
| ------------------------- | -------------- | -------------------------------------- |
| `COOKIE_ENCRYPTION_KEY`   | Vercel env var | Manual (user must re-paste cookies)    |
| `SESSION_SECRET`          | Vercel env var | Manual (invalidates existing sessions) |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel env var | Anytime via BotFather re-config        |
