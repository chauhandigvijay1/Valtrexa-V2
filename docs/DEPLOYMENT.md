# Deployment Guide

> **Last Updated:** 2026-06-26

## Prerequisites

- [Vercel](https://vercel.com) account
- [Supabase](https://supabase.com) project (PostgreSQL database)
- [@BotFather](https://t.me/botfather) Telegram bot token
- [OpenRouter](https://openrouter.ai) API key
- Google OAuth credentials (optional, for Gmail sync)
- Upstash Redis (optional, for BullMQ queues)

## Deployment Architecture

```mermaid
flowchart TB
    V[Vercel\nEdge Functions + Serverless] --> S[(Supabase PostgreSQL)]
    V --> R[(Upstash Redis)]
    V -.-> PW[Playwright\nBrowser Automation]
    TB[Telegram Bot\nWebhook] --> V
    V --> OR[OpenRouter AI Gateway]
    V --> GQ[Groq API]
```

## Step 1: Supabase Setup

### Create Project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your project URL and API keys (anon, service_role)
3. Enable Auth → configure email/password or Google OAuth

### Run Migrations

```bash
# Option A: Supabase CLI
supabase link --project-ref <project-ref>
supabase db push

# Option B: Manual SQL
# Open Supabase SQL Editor → paste contents of supabase/current_schema.sql
```

### Configure Auth (Google OAuth)

1. Supabase Dashboard → Authentication → Providers → Google
2. Set up OAuth consent screen in Google Cloud Console
3. Add redirect URI: `https://<project>.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret to Supabase

## Step 2: Vercel Deployment

### Connect Repository

1. Go to [vercel.com](https://vercel.com) → Add New Project
2. Import your GitHub repository
3. Framework preset: **Other** (TanStack Start uses Vite/Nitro)

### Environment Variables

Add all variables from [ENVIRONMENT.md](ENVIRONMENT.md). Required minimum:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SESSION_SECRET=<min 32 chars>
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_BOT_USERNAME=valtrexa_bot
OPENROUTER_API_KEY=sk-or-...
```

### Build & Deploy

```bash
# Build Command (vercel.json)
npm.cmd run build

# Output Directory
.output/public

# Install Command
npm.cmd install
```

The `vercel.json` configuration:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".output/public",
  "installCommand": "npm install",
  "framework": null
}
```

## Step 3: Telegram Bot Setup

1. Talk to [@BotFather](https://t.me/botfather)
2. Create bot → get token
3. Set bot commands (auto-registered by `telegram-init.ts`):

```
start - Initialize bot
link - Link Telegram to your account
status - System status
pause - Pause workflow
resume - Resume workflow
providers - List provider status
check - Validate cookies
jobs - Recent job matches
apply - Trigger apply cycle
analytics - Application statistics
broadcast - (admin) Send broadcast
inspect - (admin) View user details
```

4. Bot auto-registers webhook at `/api/telegram/webhook` on startup

## Step 4: Redis (Optional)

For BullMQ background queues, set up Upstash Redis:

1. Create database at [upstash.com](https://upstash.com)
2. Add env vars:

```env
REDIS_URL=rediss://default:password@host:port
# or
REDIS_TOKEN=xxxxxxxx
```

If `REDIS_URL` is not set, the system falls back to inline execution (no background queues).

## Step 5: Playwright in Production

Playwright requires browser binaries. Vercel serverless functions have limited support:

### Option A: Remote Browser

Set `PLAYWRIGHT_WS_ENDPOINT` to a browserless service:

```env
PLAYWRIGHT_WS_ENDPOINT=wss://chrome.browserless.io/ws
```

### Option B: Vercel with Chromium

Vercel includes Chromium in the execution environment by default for serverless functions. Playwright will auto-detect it.

## Post-Deployment Verification

```mermaid
flowchart LR
    A[Deploy] --> B{Health Check}
    B --> C[/api/health returns 200]
    B --> D[Telegram /status works]
    B --> E[Supabase queries succeed]
    B --> F[Auth flow works]
    C & D & E & F --> G[✅ System Ready]
```

### Health Check URLs

| Endpoint | Expected |
|---|---|
| `https://valtrexa-v2.vercel.app/` | 200 (dashboard) |
| `https://valtrexa-v2.vercel.app/api/health` | 200 (health) |
| `https://valtrexa-v2.vercel.app/api/telegram/webhook` | Accepts POST from Telegram |

### Verify

1. Visit the dashboard → should load with login
2. Create account → should redirect to onboarding
3. Run `/start` on Telegram → bot should respond
4. Run `/status` → should show workflow status
5. Check provider controls → should list providers

## Production Checklist

- [ ] All required env vars configured in Vercel
- [ ] Supabase migrations applied
- [ ] Telegram bot responds to `/start`
- [ ] Google OAuth configured (if using)
- [ ] Redis configured (optional)
- [ ] Playwright browser endpoint configured
- [ ] Sentry DSN set (optional but recommended)
- [ ] Custom domain configured (optional)
- [ ] Rate limiting considered for Telegram webhook
- [ ] Database backups configured (Supabase Pro)

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Build fails | Missing dependencies | Check install/build commands in vercel.json |
| 404 on API routes | Nitro output not configured | Ensure `.output/public` is set as output |
| Telegram bot silent | Webhook misconfigured | Check bot token, hit `/api/telegram/webhook` |
| Database errors | Migrations not applied | Run `supabase db push` or paste SQL |
| Auth fails | Wrong Supabase keys | Verify anon/service_role keys |
| 500 on Playwright | Browser not available | Set `PLAYWRIGHT_WS_ENDPOINT` or use Vercel Chromium |
| Rate limited | Too many requests | Adjust `WORKFLOW_INTERVAL_MINUTES` |
