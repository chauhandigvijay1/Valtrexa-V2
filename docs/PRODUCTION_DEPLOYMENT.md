# Production Deployment Guide — VALTREXA-V2

> **Target platform:** Vercel (recommended), with optional Redis (Upstash) and Supabase (managed Postgres).

---

## 1. Environment Variables

### 1.1 Complete Variable Catalog

All variables must be set in the Vercel project dashboard (Settings → Environment Variables). Variables marked **SSR-safe** are forwarded to the server-rendered frontend — all others stay server-only.

#### Supabase (5)

| Variable                        | Required | Description                                     | Source                              |
| ------------------------------- | -------- | ----------------------------------------------- | ----------------------------------- |
| `SUPABASE_URL`                  | **Yes**  | Supabase project endpoint URL                   | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Yes**  | Service role key (bypasses RLS)                 | Supabase Dashboard → Settings → API |
| `SUPABASE_PUBLISHABLE_KEY`      | **Yes**  | Anon/publishable key for backend SSR            | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_URL`             | **Yes**  | Same as SUPABASE_URL, for frontend client build | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **Yes**  | Same anon key, for frontend client build        | Supabase Dashboard → Settings → API |

> **SSR-safe:** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`

#### AI Providers (6)

| Variable             | Required  | Description                               | Source                                                 |
| -------------------- | --------- | ----------------------------------------- | ------------------------------------------------------ |
| `OPENROUTER_API_KEY` | Preferred | OpenRouter API key for multi-model AI     | [OpenRouter Keys](https://openrouter.ai/keys)          |
| `OPENROUTER_MODEL`   | **Yes**   | Default model (e.g. `openai/gpt-4o-mini`) | Choose from OpenRouter models                          |
| `GROQ_API_KEY`       | Preferred | Groq API key for fast inference           | [Groq Console](https://console.groq.com/keys)          |
| `GROQ_MODEL`         | **Yes**   | Default model (e.g. `llama3-8b-8192`)     | Choose from Groq models                                |
| `GEMINI_API_KEY`     | Optional  | Google Gemini API key                     | [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL`       | Optional  | Gemini model (default `gemini-2.5-pro`)   | Choose from Gemini models                              |

#### Telegram (5)

| Variable                  | Required | Description                                     | Source                                    |
| ------------------------- | -------- | ----------------------------------------------- | ----------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | Optional | Bot token from BotFather                        | [@BotFather](https://t.me/BotFather)      |
| `TELEGRAM_CHAT_ID`        | Optional | Admin chat ID for notifications                 | Telegram `@userinfobot`                   |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Secret token to validate Telegram webhook calls | Generate via `openssl rand -hex 32`       |
| `TELEGRAM_USER_ID`        | Optional | Default user ID fallback for Telegram commands  | From your Supabase users table            |
| `PUBLIC_URL`              | Optional | Public deployment URL (auto-registers webhook)  | Your Vercel domain (set **after** deploy) |

> **SSR-safe:** `PUBLIC_URL`

#### Gmail Integration (4)

| Variable              | Required | Description                                  | Source                                                                                       |
| --------------------- | -------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GMAIL_CLIENT_ID`     | Optional | Google OAuth 2.0 Client ID                   | Google Cloud Console → APIs & Services → Credentials                                         |
| `GMAIL_CLIENT_SECRET` | Optional | Google OAuth 2.0 Client Secret               | Google Cloud Console                                                                         |
| `GMAIL_REFRESH_TOKEN` | Optional | OAuth refresh token for offline Gmail access | Via Google OAuth playbook                                                                     |
| `GMAIL_REDIRECT_URI`  | Optional | OAuth redirect URI                           | Must match Google Cloud Console (e.g. `https://valtrexa-v2.vercel.app/api/auth/gmail/callback`) |

#### Redis / Queue (2)

| Variable         | Required | Description                      | Source                                      |
| ---------------- | -------- | -------------------------------- | ------------------------------------------- |
| `REDIS_URL`      | Optional | Redis connection string (BullMQ) | Upstash Dashboard or `rediss://default:...` |
| `REDISCLOUD_URL` | Optional | RedisCloud fallback URL          | RedisCloud Dashboard                        |

#### Browser Automation (2)

| Variable              | Required | Description                                        | Source                                                                                                          |
| --------------------- | -------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `EDGE_PATH`           | Optional | Path to Microsoft Edge Stable executable           | `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"` (Windows) or `/usr/bin/microsoft-edge` (Linux) |
| `EDGE_USER_DATA_DIR`  | Optional | Directory for persistent Edge user profile         | `./edge-profile` or absolute path                                                                               |
| `EDGE_PROFILE_DIRECTORY` | Optional | Path to Edge profile directory for persistent contexts | `./edge-profile` or absolute path |
| `PLAYWRIGHT_HEADLESS` | Optional | Set to `"false"` to run headed browser (debugging) | —                                                                                                               |

#### Job Boards & ATS — Cookies (5)

| Variable           | Required | Description                             | Source                                   |
| ------------------ | -------- | --------------------------------------- | ---------------------------------------- |
| `LINKEDIN_COOKIE`  | Optional | LinkedIn session cookie (`li_at=value`) | Browser DevTools → Application → Cookies |
| `INDEED_COOKIE`    | Optional | Indeed session cookie string            | Browser DevTools → Application → Cookies |
| `NAUKRI_COOKIE`    | Optional | Naukri `nauk_sid` cookie value          | Browser DevTools → Application → Cookies |
| `WELLFOUND_COOKIE` | Optional | Wellfound `_wellfound` cookie           | Browser DevTools → Application → Cookies |
| `INSTAHYRE_COOKIE` | Optional | Instahyre `sessionid` + `csrftoken`     | Browser DevTools → Application → Cookies |

#### Job Boards & ATS — API Keys (8)

| Variable                 | Required | Description                       | Source                             |
| ------------------------ | -------- | --------------------------------- | ---------------------------------- |
| `LINKEDIN_API_KEY`       | Optional | LinkedIn API key for integrations | LinkedIn Developer Portal          |
| `WELLFOUND_API_KEY`      | Optional | Wellfound API key                 | Wellfound API settings             |
| `GREENHOUSE_API_KEY`     | Optional | Greenhouse Harvest API key        | Greenhouse → Settings → Dev Center |
| `GREENHOUSE_BOARD_TOKEN` | Optional | Greenhouse public board token     | Greenhouse job board URL           |
| `LEVER_API_KEY`          | Optional | Lever Partner API key             | Lever → Settings → API             |
| `LEVER_SITE_TOKEN`       | Optional | Lever site identifier             | Lever job board URL                |
| `ASHBY_API_KEY`          | Optional | Ashby API key                     | Ashby → Settings → API             |
| `WORKABLE_API_KEY`       | Optional | Workable API key                  | Workable → Settings → API          |

#### Security (2)

| Variable         | Required | Description                           | Source                 |
| ---------------- | -------- | ------------------------------------- | ---------------------- |
| `SESSION_SECRET` | **Yes**  | Random string for session encryption  | `openssl rand -hex 64` |
| `ADMIN_EMAILS`   | Optional | Comma-separated admin email addresses | Your email(s)          |

#### Observability (4)

| Variable                    | Required | Description                                                                         | Source                          |
| --------------------------- | -------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| `SENTRY_DSN`                | Optional | Sentry project DSN for error tracking                                               | Sentry → Projects → Client Keys |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional | Traces sample rate (default `0.1`)                                                  | —                               |
| `LOG_LEVEL`                 | Optional | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default `info`) | —                               |
| `NODE_ENV`                  | Optional | Environment name: `development`, `production`                                       | Set automatically by Vercel     |

#### General / Deployment (5)

| Variable                    | Required | Description                                                   | Source             |
| --------------------------- | -------- | ------------------------------------------------------------- | ------------------ |
| `NITRO_PRESET`              | **Yes**  | Must be `vercel` for Vercel SSR                               | Set manually       |
| `FRONTEND_URL`              | Optional | Frontend origin URL (for CORS)                                | Your app domain    |
| `PUBLIC_URL`                | Optional | Public deployment URL                                         | Your Vercel domain |
| `PORT`                      | Optional | Server port (default `4173`)                                  | —                  |
| `ENABLE_TELEGRAM_APPROVALS` | Optional | Set `"true"` to require Telegram approval before applications | —                  |

#### Auto-Migration (3, fallback chain)

| Variable                | Required | Description                                          | Source                                   |
| ----------------------- | -------- | ---------------------------------------------------- | ---------------------------------------- |
| `DATABASE_URL`          | Optional | Direct Postgres connection string for auto-migration | Supabase Dashboard → Settings → Database |
| `SUPABASE_DATABASE_URL` | Optional | Fallback for auto-migration                          | Same as above                            |
| `DIRECT_URL`            | Optional | Fallback for auto-migration                          | Same as above                            |

#### Testing (1)

| Variable                   | Required | Description                       | Source       |
| -------------------------- | -------- | --------------------------------- | ------------ |
| `PLAYWRIGHT_TEST_BASE_URL` | Optional | Base URL for Playwright E2E tests | Your app URL |

### 1.2 SSR-Safe Variables (whitelisted in `api/ssr.ts`)

These 5 variables are explicitly forwarded to the server-rendered frontend:

```
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
NODE_ENV
PUBLIC_URL
FRONTEND_URL
```

All other environment variables (including `SUPABASE_SERVICE_ROLE_KEY`, API keys, secrets) stay server-only and are never exposed to the client.

### 1.3 Variables Required for Vercel

The following must **always** be set in Vercel for the app to boot:

| Variable                                  | Reason                       |
| ----------------------------------------- | ---------------------------- |
| `SUPABASE_URL`                            | Backend Supabase client init |
| `SUPABASE_SERVICE_ROLE_KEY`               | Admin database access        |
| `SUPABASE_PUBLISHABLE_KEY`                | SSR frontend Supabase client |
| `VITE_SUPABASE_URL`                       | Frontend build-time          |
| `VITE_SUPABASE_PUBLISHABLE_KEY`           | Frontend build-time          |
| `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` | AI matching (core feature)   |
| `GROQ_API_KEY` + `GROQ_MODEL`             | AI fallback provider         |
| `NITRO_PRESET=vercel`                     | SSR preset                   |
| `SESSION_SECRET`                          | Session encryption           |

---

## 2. Supabase Setup

### 2.1 Run All Migrations in Order

Migrations are in `supabase/migrations/`. Apply them sequentially:

```
20260529133833_e05b8da4-068b-4844-a2bd-ee03555472e4.sql
20260529133900_d8c71c6c-0a32-4a45-84ce-7721a671b505.sql
20260529133925_0b4348a5-51b0-491f-aacc-e1bdc9332ebd.sql
20260529140546_ab2d62c2-a2f5-4c7f-a576-8b41adec3af7.sql
20260529152000_ai_career_os.sql
20260603000000_candidate_brain.sql
20260603000001_application_tier.sql
20260603000002_company_target_value.sql
20260604000000_latex_pdf_path.sql
20260604000002_fix_workflow_events_trigger.sql
20260604100000_phase_recovery.sql
20260605000000_candidate_brain_expansion.sql
20260607090000_resume_sync_and_job_filters.sql
20260622000000_phase_a_b_engine_completion.sql
20260622000001_phase_p1_p8_completion.sql
20260625000000_comprehensive_schema_fix.sql
20260625000001_provider_controls.sql
20260625000002_workflow_state.sql
20260625000003_multi_user.sql
20260625000004_production_gaps.sql
20260625000006_production_fix.sql
20260625000007_schema_consolidation.sql
20260626000001_production_stabilization.sql
20260626000002_provider_cookies.sql
20260627000000_resume_version_parse_columns.sql
```

Via Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase migration up --linked
```

Or via Supabase Dashboard → SQL Editor — paste and run each file in order.

### 2.2 Enable Google OAuth

1. Supabase Dashboard → Authentication → Providers → Google
2. Toggle **Enable**
3. Enter **Client ID** and **Client Secret** from Google Cloud Console
4. Save

### 2.3 Configure Redirect URIs

In Supabase Dashboard → Authentication → URL Configuration:

```
Site URL: https://valtrexa-v2.vercel.app
Redirect URLs:
  https://valtrexa-v2.vercel.app/api/auth/callback
  https://valtrexa-v2.vercel.app/auth/callback
  http://localhost:4173/api/auth/callback  (for local dev)
```

In **Google Cloud Console** → APIs & Services → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs:

```
https://<your-project>.supabase.co/auth/v1/callback
```

### 2.4 Row Level Security

RLS is enforced by the migrations. Verify in Supabase Dashboard → Authentication → Policies that all tables have policies enabled. Key tables with RLS:

- `profiles` — user-scoped
- `jobs` — user-scoped
- `applications` — user-scoped
- `workflow_state` — user-scoped
- `queue_jobs` — user-scoped
- `notifications` — user-scoped
- `outreaches` — user-scoped
- `company_research` — user-scoped
- `candidate_brain` — user-scoped

---

## 3. Vercel Deployment

### 3.1 Configuration

| Setting          | Value                              |
| ---------------- | ---------------------------------- |
| Framework preset | **Other** (TanStack Start / Nitro) |
| Build command    | `npm run build`                    |
| Output directory | `dist/client`                      |
| Node.js version  | 22+                                |

### 3.2 Build Process

The build command (`npm run build`) does two things:

1. `vite build` — builds the TanStack Start app (outputs to `dist/client` and `dist/server`)
2. `node scripts/prepare-vercel-ssr.mjs` — copies `dist/server` → `api/_dist/server`

This is required because Vercel's serverless functions read from `api/_dist/`.

### 3.3 Rewrites Configuration (`vercel.json`)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist/client",
  "functions": {
    "api/**/*.ts": {
      "includeFiles": "api/_dist/**"
    }
  },
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "/api/[...route]"
    },
    {
      "source": "/((?!api/|assets/|favicon\\.ico|robots\\.txt|sitemap\\.xml|_next/).*)",
      "destination": "/api/ssr"
    }
  ]
}
```

- `/api/:path*` → all API routes handled by `api/[...route].ts`
- Everything else (excluding static assets) → `api/ssr.ts` for SSR rendering

### 3.4 Environment Variables Setup

In Vercel Dashboard → Settings → Environment Variables, add **all** required variables. Use different values for Production, Preview, and Development environments as needed.

**Important:** Set `NITRO_PRESET=vercel` at the project level (not in `.env`).

### 3.5 Cron Job Configuration

The workflow cycle endpoint runs the full automation pipeline (job import → matching → applications → recruiter discovery → outreach → followups).

**Vercel Cron Jobs** (Vercel Dashboard → Settings → Cron Jobs):

```
Name: workflow-cycle
Schedule: */30 * * * *
URL: https://valtrexa-v2.vercel.app/api/workflow/cycle
Method: POST
```

The cron passes no auth — internally `handleWorkflowCycle` calls `requireApiUser` which expects a valid session. For cron-triggered runs, ensure a service-level auth mechanism is configured (see Section 9).

---

## 4. Redis / Queue

### 4.1 Local vs Production

| Environment | Redis                     | Notes                           |
| ----------- | ------------------------- | ------------------------------- |
| Local dev   | `redis://localhost:6379`  | Requires local Redis server     |
| Production  | **Upstash** (recommended) | Serverless, free tier available |

### 4.2 Upstash Setup

1. Create account at [upstash.com](https://upstash.com)
2. Create a Redis database (any region)
3. Copy the `REDIS_URL` (looks like `rediss://default:...`)
4. Set `REDIS_URL` in Vercel environment variables

### 4.3 Inline Fallback Behavior

When Redis is unreachable, the queue system degrades gracefully (see `api/_lib/queue.ts`):

| Mode      | Condition                                | Behavior                                         |
| --------- | ---------------------------------------- | ------------------------------------------------ |
| `redis`   | Redis reachable                          | Job added to BullMQ queue                        |
| `inline`  | Redis down, `runInline` handler provided | Job executed synchronously in the same request   |
| `db-only` | Redis down, no inline handler            | Job recorded in `queue_jobs` table, no execution |

The API **never crashes** when Redis is unavailable — it just runs inline (within the Vercel function timeout of 60s for Hobby plan, 900s for Pro).

### 4.4 BullMQ Queue Names and Purposes

| Queue Name   | Purpose                    | Worker Handler                          |
| ------------ | -------------------------- | --------------------------------------- |
| `job-import` | Import jobs from providers | `importJobsInline`                      |
| `apply`      | Submit applications        | `applyInline` / `playwrightApplyInline` |
| `recruiter`  | Discover recruiters        | `discoverRecruitersInline`              |
| `outreach`   | Generate outreach messages | `generateOutreachInline`                |
| `followup`   | Process follow-up cadences | `processFollowupsInline`                |
| `gmail`      | Sync Gmail inbox           | `syncGmailInline`                       |
| `analytics`  | Run analytics computations | `runAnalyticsInline`                    |

### 4.5 Worker Process

For production environments where you have a long-running server (e.g. Railway, Render, or a VPS), you can run the dedicated worker:

```bash
# Start all workers
npm run worker

# Start specific queues only
npm run worker -- job-import apply recruiter

# Start with tsx for development
npx tsx workers/worker.ts
```

Workers require Redis to be available. If Redis is down, the worker process exits with an error. The API still works in inline mode.

On Vercel (serverless), you typically **do not run workers** — the inline fallback executes jobs during the request. For heavy workloads, consider a hybrid: Vercel for the API + a separate worker host (Railway, Render, EC2) with Redis.

---

## 5. Telegram Bot

### 5.1 Create Bot via BotFather

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name (e.g. `Career Compass Bot`)
4. Choose a username (e.g. `career_compass_bot`)
5. Save the API token — this is your `TELEGRAM_BOT_TOKEN`

### 5.2 Set Webhook

The bot auto-registers its webhook on startup (via `api/_lib/telegram-init.ts`) when `PUBLIC_URL` is set. To register manually:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://valtrexa-v2.vercel.app/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

Verify:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Expected response includes `"url": "https://valtrexa-v2.vercel.app/api/telegram/webhook"` and `"has_custom_certificate": false`.

### 5.3 Secret Token for Webhook Validation

Set `TELEGRAM_WEBHOOK_SECRET` to a random string. The bot checks this secret on every incoming webhook request to verify it came from Telegram.

Generate:

```bash
openssl rand -hex 32
```

### 5.4 Register Bot Commands

Commands are registered automatically on startup via `registerTelegramCommands()`. To register manually:

```bash
npx tsx scripts/register-telegram-commands.ts
```

Key commands:

- `/start` or `/health` — System health check
- `/status` — Dashboard summary
- `/connect` — Bind Telegram user to web account
- `/workflow_start` / `/workflow_stop` / `/workflow_pause` / `/workflow_resume` — Workflow controls
- `/provider_enable <name>` / `/provider_disable <name>` — Provider controls

### 5.5 Per-User Binding

Users bind their Telegram account via the `/connect` command or the web dashboard. The binding is stored in `telegram_bindings` table. After binding:

- Notifications are delivered to the user's personal chat
- Workflow controls operate on their own workflow state
- Provider controls are user-scoped

---

## 6. Browser Automation

### 6.1 Edge Stable Requirement

Playwright-based browser automation targets **Microsoft Edge Stable**. The app uses Edge for:

- LinkedIn cookie acquisition and job scraping
- Indeed cookie acquisition and job scraping
- Application submission automation

### 7.2 EDGE_PATH Configuration

Set `EDGE_PATH` to the absolute path of the Edge executable:

| OS      | Typical Path                                                     |
| ------- | ---------------------------------------------------------------- |
| Windows | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`   |
| macOS   | `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge` |
| Linux   | `/usr/bin/microsoft-edge`                                        |

### 7.3 EDGE_USER_DATA_DIR / EDGE_PROFILE_DIRECTORY

Directory for persistent Edge user profiles. This stores login sessions so cookies persist across runs.

```
EDGE_USER_DATA_DIR="./edge-profile"
EDGE_PROFILE_DIRECTORY="./edge-profile"
```

`EDGE_PROFILE_DIRECTORY` is used by the Playwright platform to locate the persistent profile directory. If not set, defaults to `edge-profile` in the project root.

### 7.4 Headless Mode

By default, the browser runs in headless mode. To see the browser window (useful for debugging):

```
PLAYWRIGHT_HEADLESS=false
```

### 7.5 Playwright on Vercel

Playwright requires browser binaries. Vercel serverless functions have limited support. For production browser automation:

- Use a dedicated worker host (Railway, Render, EC2) with full browser support
- Or use the cookie-based API modes (non-Playwright) which don't require browser automation

The code checks `process.env.PLAYWRIGHT_HEADLESS` and falls back gracefully when Playwright is unavailable.

---

## 8. Gmail Integration (Optional)

### 8.1 Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project or select existing
3. Enable **Gmail API** (APIs & Services → Library)
4. Go to **Credentials** → Create Credentials → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs: Add your callback URL

### 8.2 OAuth Consent Screen

1. APIs & Services → OAuth consent screen
2. User type: **External** (or Internal if using Google Workspace)
3. Fill required fields (app name, support email, developer contact)
4. Add scopes: `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`
5. Add test users (if in testing mode)

### 8.3 Get Refresh Token

Follow the Google OAuth playbook to generate a refresh token manually.

Or follow the OAuth flow manually to obtain a refresh token.

### 8.4 Required Env Vars

```
GMAIL_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GMAIL_CLIENT_SECRET="your-client-secret"
GMAIL_REFRESH_TOKEN="your-refresh-token"
GMAIL_REDIRECT_URI="https://valtrexa-v2.vercel.app/api/auth/gmail/callback"
```

The redirect URI must match exactly what's configured in Google Cloud Console.

---

## 9. Scheduling / Cron

### 9.1 Vercel Cron Jobs (Recommended)

Vercel Pro plan supports cron jobs:

- **Endpoint:** `POST /api/workflow/cycle`
- **Schedule:** `*/30 * * * *` (every 30 minutes)
- **Authentication:** Cron calls from Vercel include `CRON_SECRET` header if configured (see Vercel docs for CRON_SECRET env var)

Configure in Vercel Dashboard → Settings → Cron Jobs:

```
Cron Job 1:
  Name: workflow-cycle
  Schedule: */30 * * * *
  URL: https://valtrexa-v2.vercel.app/api/workflow/cycle
  Method: POST
```

### 9.2 Alternative: cron-job.org

Free alternative for hobby projects:

1. Go to [cron-job.org](https://cron-job.org)
2. Create account
3. Create job:
   - URL: `https://valtrexa-v2.vercel.app/api/workflow/cycle`
   - Method: `POST`
   - Interval: Every 30 minutes
   - Headers: (optional, for auth)

### 9.3 Workflow State Machine

The workflow has 4 states controlled via Telegram or API:

| Command            | Action               | DB Status |
| ------------------ | -------------------- | --------- |
| `/workflow_start`  | Start the automation | `running` |
| `/workflow_pause`  | Pause (resumable)    | `paused`  |
| `/workflow_resume` | Resume from pause    | `running` |
| `/workflow_stop`   | Full stop (reset)    | `stopped` |

The cron job triggers `handleWorkflowCycle`, which:

1. Reads the user's workflow state from `workflow_state` table
2. If `running`, executes the full pipeline phases:
   - Health check
   - Job import (all enabled providers)
   - Job matching
   - Auto-apply (Pipeline A)
   - High-value analysis (Pipeline B)
   - Recruiter discovery
   - Outreach generation
   - Follow-up processing
   - Gmail sync
3. Records results in `workflow_log`
4. Resets state if still `running` after cycle

---

## 10. Monitoring & Observability

### 10.1 Sentry Configuration

Set up error tracking:

```
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
SENTRY_TRACES_SAMPLE_RATE=0.1
```

Sentry is initialized in `api/_lib/sentry.ts`. It filters out health check and webhook noise:

```typescript
beforeSend(event) {
  const url = event.request?.url ?? "";
  if (url.includes("/health") || url.includes("/healthz") || url.includes("/telegram/webhook")) {
    return null;
  }
  return event;
}
```

### 10.2 Rate Limiting

Configured in `api/_lib/rate-limiter.ts`:

| Variable                  | Default         | Description                     |
| ------------------------- | --------------- | ------------------------------- |
| `RATE_LIMIT_WINDOW_MS`    | `60000` (1 min) | Window duration in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `100`           | Max requests per window per IP  |

Rate limiting is in-memory (not Redis-backed). It resets every 60 seconds.

### 10.3 Log Level

```
LOG_LEVEL=info
```

Options: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. Uses Pino logger with pretty-printing in development.

### 10.4 Health Check Endpoint

```
GET /api/health
```

Returns:

```json
{
  "status": "ok" | "degraded",
  "timestamp": "2026-06-25T12:00:00.000Z",
  "uptime": 1234.56,
  "checks": {
    "database": { "ok": true, "error": null, "latencyMs": 42 },
    "redis": { "ok": true, "error": null },
    "version": "1.0.0"
  }
}
```

The health check pings Supabase (`workflow_events` table) and Redis (if configured). If database fails, status is `"degraded"`.

---

## 11. Security Checklist

### 11.1 Admin Access

```
ADMIN_EMAILS="admin1@example.com,admin2@example.com"
```

Only these emails can access admin API routes. If unset, **all authenticated users are admins** (set it in production!).

### 11.2 Telegram Webhook Secret

```
TELEGRAM_WEBHOOK_SECRET=<random-hex-string>
```

The API validates incoming Telegram webhook requests against this secret token. Telegram sends it as `X-Telegram-Bot-Api-Secret-Token` header.

### 11.3 Session Secret

```
SESSION_SECRET=<random-64-char-hex>
```

Generated once and kept secret. Used for session encryption. Rotate if compromised.

### 11.4 CORS Configuration

CORS is configured in `api/_lib/http.ts`:

- Reads `FRONTEND_URL` or `PUBLIC_URL` to build an allowlist
- Defaults to allowing all origins if neither is set (permissive for development)
- Sets `access-control-allow-origin` on all API responses
- Handles OPTIONS preflight with a 204 response
- Allowed methods: GET, POST, PUT, DELETE, PATCH, OPTIONS

For production, ensure `FRONTEND_URL` is set to restrict CORS to your domain only.

### 11.5 Error Message Sanitization

All API errors return a sanitized message via `safeErrorMessage()` in `api/_lib/http.ts`:

```typescript
export function safeErrorMessage(err: unknown): string {
  return "An unexpected error occurred";
}
```

Internal error details are logged but never exposed to API responses.

### 11.6 SSR Env Leak Prevention

Only 5 whitelisted variables are passed to the SSR context (see `api/ssr.ts`):

```
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
NODE_ENV
PUBLIC_URL
FRONTEND_URL
```

Server-side env vars like `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, API keys, and cookies are never sent to the client.

### 11.7 Secret Management Do's and Don'ts

| Do                                                  | Don't                                  |
| --------------------------------------------------- | -------------------------------------- |
| Set secrets in Vercel Dashboard (encrypted at rest) | Commit `.env` to git                   |
| Rotate `SESSION_SECRET` periodically                | Share `SUPABASE_SERVICE_ROLE_KEY`      |
| Use unique `TELEGRAM_WEBHOOK_SECRET`                | Log env vars in production             |
| Set `ADMIN_EMAILS` restrictive list                 | Use weak `SESSION_SECRET` (< 32 chars) |

---

## 12. First-Time Setup Checklist

### Pre-Deployment

- [ ] **Create Supabase project** at [supabase.com](https://supabase.com) (free tier works)
- [ ] **Clone the repository** and run `npm install`
- [ ] **Copy `.env.example` to `.env`** and fill in credentials
- [ ] **Run all 27 migrations** via `npx supabase migration up --linked` or paste SQL in order
- [ ] **Enable Google OAuth** in Supabase Auth → Providers → Google
- [ ] **Configure Site URL and Redirect URIs** in Supabase Auth → URL Configuration
- [ ] **Verify build** succeeds: `npm run build`
- [ ] **Run tests**: `npm test`
- [ ] **Push to GitHub** (Vercel imports from Git)

### Vercel Deployment

- [ ] **Import repository** to Vercel (Framework: Other)
- [ ] **Set `NITRO_PRESET=vercel`** in Vercel environment variables
- [ ] **Set all required env vars** (see Section 1.3) in Vercel Dashboard
- [ ] **Deploy** — verify build succeeds and app loads at `https://valtrexa-v2.vercel.app`
- [ ] **Visit `/api/health`** — confirm `"status": "ok"`
- [ ] **Update `PUBLIC_URL`** in Vercel env vars to `https://valtrexa-v2.vercel.app`
- [ ] **Re-deploy** so Telegram webhook auto-registers

### Telegram Bot

- [ ] **Create bot** via [@BotFather](https://t.me/BotFather), save token
- [ ] **Set `TELEGRAM_BOT_TOKEN`** in Vercel env vars
- [ ] **Set `TELEGRAM_WEBHOOK_SECRET`** in Vercel env vars
- [ ] **Verify webhook** is registered: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- [ ] **Test bot** — send `/health` to your bot, expect a response

### Redis / Queue (Optional)

- [ ] **Create Upstash Redis** database (free tier: 100MB)
- [ ] **Copy `REDIS_URL`** and set in Vercel env vars
- [ ] **Re-deploy** — check `/api/health` shows Redis OK
- [ ] **Verify inline fallback** works (temporarily remove REDIS_URL, check queue still processes)

### First Production Run

- [ ] **Create a user account** on the app (email/password or Google OAuth)
- [ ] **Open the dashboard** — verify it loads with all sections
- [ ] **Complete onboarding wizard** (resume upload, preferences, etc.)
- [ ] **Add at least one provider cookie** via Telegram `/refresh_cookies <provider> <cookie>`
- [ ] **Run `/workflow_start`** via Telegram
- [ ] **POST to `/api/workflow/cycle`** — verify it returns a CycleResult
- [ ] **Check jobs imported** — `/jobs` in Telegram or dashboard
- [ ] **Verify Telegram notifications** arrive on events
- [ ] **Test with real provider accounts** (LinkedIn, Indeed, etc.)
- [ ] **Configure Vercel Cron Job** — schedule every 30 min
- [ ] **Monitor Sentry** for errors after first few cycles

### Ongoing Maintenance

- [ ] **Rotate cookies** when providers expire (~1-2 week lifespan)
- [ ] **Monitor Supabase usage** (Row limits on free tier: 500MB / 50K rows)
- [ ] **Check Vercel logs** for function timeouts or errors
- [ ] **Review Sentry issues** weekly
