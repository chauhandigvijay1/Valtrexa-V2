# Environment Variables Reference

> **Last Updated:** 2026-06-26

## Supabase

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL (e.g., `https://xxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | ✅ | Public anon key for client-side auth |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key for admin/bot operations (server-only) |
| `SUPABASE_JWT_SECRET` | ❌ | JWT secret for verifying auth tokens (admin operations) |

## Application

| Variable | Required | Description |
|---|---|---|
| `APP_NAME` | ❌ | Application display name (default: `VALTREXA-V2`) |
| `APP_URL` | ❌ | Public URL (default: derived from `VERCEL_URL` or `http://localhost:3000`) |
| `SESSION_SECRET` | ✅ | Secret for session encryption (minimum 32 characters) |
| `NODE_ENV` | ❌ | Environment: `development`, `test`, `production` (default: `development`) |

## Telegram

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather |
| `TELEGRAM_BOT_USERNAME` | ✅ | Bot username (e.g., `valtrexa_bot`) |
| `TELEGRAM_ADMIN_IDS` | ❌ | Comma-separated Telegram chat IDs with admin access |

## Encryption

| Variable | Required | Description |
|---|---|---|
| `COOKIE_ENCRYPTION_KEY` | ❌ | 64-character hex string (32 bytes) for AES-256-GCM. Must be set explicitly if cookie encryption is needed |

## AI / LLM

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | OpenRouter API key for multi-model AI access |
| `OPENROUTER_MODEL` | ❌ | Default model override (e.g., `anthropic/claude-3.5-sonnet`) |
| `GROQ_API_KEY` | ❌ | Groq API key for fast inference tasks |
| `GROQ_MODEL` | ❌ | Default Groq model override (e.g., `llama-3.3-70b-versatile`) |

## Automation (Playwright)

| Variable | Required | Description |
|---|---|---|
| `PLAYWRIGHT_HEADLESS` | ❌ | Run browser in headless mode (`true`/`false`, default: `true`) |
| `PLAYWRIGHT_TIMEOUT` | ❌ | Default navigation timeout in ms (default: `30000`) |
| `PLAYWRIGHT_WS_ENDPOINT` | ❌ | Remote Playwright endpoint (for browserless.io or similar) |

## Workflow

| Variable | Required | Description |
|---|---|---|
| `WORKFLOW_INTERVAL_MINUTES` | ❌ | Time between workflow cycles in minutes (default: `60`) |
| `MATCH_THRESHOLD` | ❌ | Minimum match score to trigger apply (0–100, default: `70`) |
| `MAX_APPLICATIONS_PER_CYCLE` | ❌ | Max applications per pipeline run (default: `10`) |
| `APPROVAL_MODE` | ❌ | Require approval before applying (`true`/`false`, default: `true`) |

To run the dedicated background worker (e.g. on Railway): `npm run worker`

## Redis / Queue

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | ❌ | Redis connection string (e.g., `rediss://default:password@host:port`). Required for BullMQ; inline fallback if not set |
| `REDIS_TOKEN` | ❌ | Upstash Redis token (alternative to `REDIS_URL`) |

## Monitoring

| Variable | Required | Description |
|---|---|---|
| `SENTRY_DSN` | ❌ | Sentry DSN for error tracking (node + react) |
| `SENTRY_ENVIRONMENT` | ❌ | Sentry environment label (default: `NODE_ENV`) |
| `LOG_LEVEL` | ❌ | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default: `info`) |

## Cookie Fallbacks (Development)

| Variable | Required | Description |
|---|---|---|
| `LINKEDIN_COOKIE` | ❌ | LinkedIn session cookie value (dev/test fallback) |
| `INDEED_COOKIE` | ❌ | Indeed session cookie value (dev/test fallback) |
| `NAUKRI_COOKIE` | ❌ | Naukri session cookie value (dev/test fallback) |
| `WELLFOUND_COOKIE` | ❌ | Wellfound session cookie value (dev/test fallback) |

## Browser Automation

| Variable | Required | Description |
|---|---|---|
| `EDGE_PROFILE_DIRECTORY` | ❌ | Path to Edge profile directory for persistent browser contexts (default: `edge-profile`) |
| `EDGE_PATH` | ❌ | Path to Microsoft Edge executable (auto-detected if not set) |

## Vercel (Auto-Provided)

| Variable | Description |
|---|---|
| `VERCEL_URL` | Auto-provided deployment URL |
| `VERCEL_ENV` | `production`, `preview`, `development` |
| `VERCEL_REGION` | Serverless function region |

## Environment File Loading Order

Environment variables are loaded in `api/_lib/env.ts` with the following precedence (highest first):

1. Actual runtime environment (process.env) — includes Vercel auto-provided vars and dashboard-configured secrets
2. `.env.local` — local overrides (git-ignored)
3. `.env` — shared defaults (committed to repo)

All vars are validated on startup by `env.ts`. Missing required vars throw an error with clear messaging. Optional vars use defaults defined in the config files.
