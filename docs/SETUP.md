# Setup Guide — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29

## Prerequisites

| Requirement          | Version       | Purpose         |
| -------------------- | ------------- | --------------- |
| Node.js              | 22+           | Runtime         |
| npm                  | 10+           | Package manager |
| Supabase account     | Free tier+    | Database + Auth |
| Telegram Bot Token   | BotFather     | Bot integration |
| OpenRouter API key   | openrouter.ai | AI generation   |
| Google Cloud Project | Free tier     | Gmail OAuth     |
| Vercel account       | Hobby+        | Hosting         |

## 1. Clone & Install

```bash
git clone <your-repo-url>
cd career-compass-pro
npm.cmd install
```

> **Note for Windows:** Always use `npm.cmd` or `npx.cmd` — never `npm` or `npx` bare.

## 2. Environment Variables

Copy the template and fill in your values:

```bash
copy .env.example .env
```

**Required variables (must set before starting):**

- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings → API
- `SESSION_SECRET` — generate: `npx.cmd uuid`
- `TELEGRAM_BOT_TOKEN` — from BotFather
- `OPENROUTER_API_KEY` — from openrouter.ai/keys
- `COOKIE_ENCRYPTION_KEY` — generate: `npx.cmd uuid && npx.cmd uuid`

See [`ENVIRONMENT.md`](./ENVIRONMENT.md) for the complete reference.

## 3. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run all migrations in `supabase/migrations/` in order via SQL Editor:
   - Navigate to your Supabase dashboard → SQL Editor
   - Open each `.sql` file, copy contents, paste, run
   - Run them in **alphanumeric filename order**
   - After all migrations: `NOTIFY pgrst, 'reload schema';`
3. Configure Authentication:
   - Go to **Authentication → Settings → URL Configuration**
   - **Site URL**: `https://valtrexa-v2.vercel.app` (or `http://localhost:4173` for dev)
   - **Redirect URLs**: `https://valtrexa-v2.vercel.app/auth/callback`
4. Enable Google OAuth:
   - Authentication → Providers → Google
   - Client ID + Secret from [Google Cloud Console](https://console.cloud.google.com)
   - Authorized redirect URI in Google Cloud Console: `https://<project>.supabase.co/auth/v1/callback`

## 4. Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Create a new bot: `/newbot` → name it `ValtrexaV2Bot`
3. Save the token as `TELEGRAM_BOT_TOKEN`
4. Set a webhook secret: `TELEGRAM_WEBHOOK_SECRET` (random 32+ chars)
5. The bot auto-registers its commands and webhook on startup when `PUBLIC_URL` is set

**Webhook URL:** `https://valtrexa-v2.vercel.app/api/telegram/webhook`

### Telegram Multi-User Binding

Each user must connect their Telegram chat via `/connect`:

1. Send `/connect` to the bot → receives a unique URL
2. Visit the URL in a browser → confirms binding
3. The bot now associates your chat with your user account
4. All commands (except `/health`, `/start`, `/help`, `/menu`) require binding

⚠️ No env-var fallback for inbound. Users without a binding will see "not connected".

## 5. Google OAuth for Gmail

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Gmail API**
3. Go to **APIs & Services → Credentials**
4. Create OAuth 2.0 Client ID (Desktop app type)
5. **Authorized redirect URIs**: `https://valtrexa-v2.vercel.app`
6. Save `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`
7. Obtain a refresh token via the OAuth consent flow

## 6. Start Development

```bash
# Terminal 1: Redis (required for queue)
docker run -p 6379:6379 redis:7

# Terminal 2: Dev server
npm.cmd run dev
```

## 7. Build for Production

```bash
npm.cmd run build
```

The output goes to `dist/client` (static) and `dist/server` (SSR).

## 8. Deploy to Vercel

1. Push to GitHub
2. Import repo in Vercel
3. Set all environment variables in Vercel dashboard
4. Deploy — the `vercel.json` config handles the rest

## Troubleshooting

| Issue                         | Solution                                                |
| ----------------------------- | ------------------------------------------------------- |
| `tsc --noEmit` errors         | Check imports and TypeScript types                      |
| Build fails on missing module | `npm.cmd install`                                       |
| Database connection fails     | Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`   |
| Telegram bot not responding   | Check `TELEGRAM_BOT_TOKEN` and webhook URL              |
| Playwright browser not found  | Install Chromium: `npx.cmd playwright install chromium` |
| Redis connection refused      | Start Redis: `docker run -p 6379:6379 redis:7`          |
