# Environment Variables — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29

All environment variables are loaded from `.env` (overridden by `.env.local`).  
**Production** values are set in Vercel/Railway dashboard — never commit secrets.

---

## 1. Supabase

| Variable                    | Required | Production Value            | Notes                              |
| --------------------------- | -------- | --------------------------- | ---------------------------------- |
| `SUPABASE_URL`              | **Yes**  | Your Supabase project URL   | `https://<project>.supabase.co`    |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes**  | Your service_role key       | **Never expose to client**         |
| `SUPABASE_ANON_KEY`         | **Yes**  | Your anon key               | Safe for client use (RLS enforces) |
| `SUPABASE_PUBLISHABLE_KEY`  | No       | Same as `SUPABASE_ANON_KEY` | Alias for frontend                 |

## 2. Application

| Variable         | Required | Production Value                 | Notes                                               |
| ---------------- | -------- | -------------------------------- | --------------------------------------------------- |
| `PUBLIC_URL`     | **Yes**  | `https://valtrexa-v2.vercel.app` | Used for CORS, redirects, webhook registration      |
| `FRONTEND_URL`   | **Yes**  | `https://valtrexa-v2.vercel.app` | CORS allowed origin (comma-separated for multiples) |
| `SESSION_SECRET` | **Yes**  | Random 32+ char string           | Server-side session signing                         |
| `NODE_ENV`       | No       | `production`                     | Set automatically by Vercel                         |
| `PORT`           | No       | `3000`                           | Dev only                                            |

## 3. Telegram Bot

| Variable                  | Required | Production Value       | Notes                                                                                                      |
| ------------------------- | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | **Yes**  | From BotFather         | Bot authentication                                                                                         |
| `TELEGRAM_WEBHOOK_SECRET` | **Yes**  | Random 32+ char string | HMAC verification — prevents unauthorized webhook calls                                                    |
| `TELEGRAM_BOT_USERNAME`   | No       | `ValtrexaV2Bot`        | Used for deep-link generation                                                                              |
| `TELEGRAM_CHAT_ID` | Legacy | Your Telegram chat ID | Admin alerting only (outbound). NOT used for inbound user resolution |

## 4. Encryption & Security

| Variable                  | Required | Production Value                                | Notes                                                                                    |
| ------------------------- | -------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `COOKIE_ENCRYPTION_KEY`   | **Yes**  | Random 32+ char string (A-Z, a-z, 0-9, symbols) | AES-256-GCM key derivation. Without this, stored cookies are decryptable via SHA-256("") |
| `RATE_LIMIT_WINDOW_MS`    | No       | `60000`                                         | Rate limit window in ms                                                                  |
| `RATE_LIMIT_MAX_REQUESTS` | No       | `100`                                           | Max requests per window                                                                  |

## 5. AI / LLM Providers

| Variable             | Required | Production Value           | Notes                |
| -------------------- | -------- | -------------------------- | -------------------- |
| `OPENROUTER_API_KEY` | **Yes**  | From openrouter.ai/keys    | Primary AI provider  |
| `OPENROUTER_MODEL`   | No       | `openai/gpt-4o-mini`       | Default model        |
| `GROQ_API_KEY`       | No       | From console.groq.com/keys | Fallback AI provider |
| `GEMINI_API_KEY`     | No       | From aistudio.google.com   | Secondary fallback   |

## 6. Gmail OAuth

| Variable              | Required | Production Value                 | Notes                           |
| --------------------- | -------- | -------------------------------- | ------------------------------- |
| `GMAIL_CLIENT_ID`     | **Yes**  | From Google Cloud Console        | OAuth 2.0 Client ID             |
| `GMAIL_CLIENT_SECRET` | **Yes**  | From Google Cloud Console        | OAuth 2.0 Client Secret         |
| `GMAIL_REFRESH_TOKEN` | **Yes**  | Obtained via OAuth consent flow  | Single-mailbox shared token     |
| `GMAIL_REDIRECT_URI`  | **Yes**  | `https://valtrexa-v2.vercel.app` | Must match Google Cloud Console |

**⚠️ Gmail is single-mailbox only.** The system uses one shared Gmail account configured via env vars. Multi-tenant Gmail is not supported.

**⚠️ No per-provider cookie env vars.** `LINKEDIN_COOKIE`, `INDEED_COOKIE`, `NAUKRI_COOKIE`, `WELLFOUND_COOKIE`, `INSTAHYRE_COOKIE` were removed in v1.0.1. All provider cookies are per-user encrypted in `provider_cookies` table. Each user must add cookies via dashboard Settings or Telegram `/refresh_cookies`.

## 7. Playwright / Browser Automation

| Variable                 | Required | Production Value     | Notes                                   |
| ------------------------ | -------- | -------------------- | --------------------------------------- |
| `PLAYWRIGHT_HEADLESS`    | No       | `true`               | Run browser in headless mode            |
| `EDGE_PATH`              | No       | Path to Edge binary  | Only needed for local cookie extraction |
| `EDGE_USER_DATA_DIR`     | No       | Path to Edge profile | Only needed for local cookie extraction |
| `EDGE_PROFILE_DIRECTORY` | No       | `Default`            | Edge profile name                       |

## 8. Redis / Queue

| Variable         | Required | Production Value                     | Notes                    |
| ---------------- | -------- | ------------------------------------ | ------------------------ |
| `REDIS_URL`      | **Yes**  | `redis://default:password@host:port` | Upstash or Railway Redis |
| `REDISCLOUD_URL` | No       | Fallback alias for REDIS_URL         | Legacy compatibility     |

## 9. Monitoring

| Variable             | Required | Production Value | Notes                                             |
| -------------------- | -------- | ---------------- | ------------------------------------------------- |
| `SENTRY_DSN`         | **Yes**  | From sentry.io   | Error tracking                                    |
| `SENTRY_ENVIRONMENT` | No       | `production`     | Sentry environment tag                            |
| `LOG_LEVEL`          | No       | `info`           | Pino log level (`info`, `warn`, `error`, `debug`) |

## 10. Feature Flags

| Variable                    | Required | Production Value | Notes                                                             |
| --------------------------- | -------- | ---------------- | ----------------------------------------------------------------- |
| `ENABLE_TELEGRAM_APPROVALS` | No       | `true`           | Enable approval flow via Telegram                                 |
| `TELEGRAM_CHAT_ID`          | No       | —                | Admin alerts destination (outbound only, not for user resolution) |

## 11. Vercel Auto-Provided

These are set automatically by Vercel:

- `VERCEL=1`
- `VERCEL_ENV=production`
- `VERCEL_URL=valtrexa-v2.vercel.app`
