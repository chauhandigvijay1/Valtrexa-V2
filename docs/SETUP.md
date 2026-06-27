# Setup Guide

Local development setup for VALTREXA-V2.

## Prerequisites

- Node.js 22+
- Docker (for Redis)
- A Supabase project (free tier works)
- A Telegram bot token (from BotFather)
- Microsoft Edge (for cookie extraction)

## Step 1: Clone & Install

```bash
git clone <repo-url>
cd valtrexa-v2
npm.cmd install
```

## Step 2: Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

| Variable                    | How to Get                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase dashboard → Settings → API → Project URL                                           |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → service_role key                                      |
| `SESSION_SECRET`            | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`        |
| `TELEGRAM_BOT_TOKEN`        | BotFather → `/newbot` → copy token                                                          |
| `TELEGRAM_CHAT_ID`          | Send a message to your bot → `https://api.telegram.org/bot$TOKEN/getUpdates` → copy chat.id |
| `LINKEDIN_COOKIE`           | Extract from Edge session via `scripts/refresh-cookies.ts`                                  |
| `INDEED_COOKIE`             | Same as above                                                                               |
| `NAUKRI_COOKIE`             | Same as above                                                                               |
| `WELLFOUND_COOKIE`          | Same as above                                                                               |
| `INSTAHYRE_COOKIE`          | Same as above                                                                               |
| `GMAIL_CLIENT_ID`           | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID                  |
| `GMAIL_CLIENT_SECRET`       | Same as above                                                                               |
| `GMAIL_REFRESH_TOKEN`       | Run Google OAuth playground with your client ID/secret                                      |
| `GMAIL_REDIRECT_URI`        | `http://localhost:4173/api/auth/gmail/callback` (dev)                                       |

## Step 3: Start Redis

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Verify: `redis-cli ping` → PONG

## Step 4: Apply Database Migrations

```bash
npx.cmd supabase link --project-ref <your-project-ref>
npx.cmd supabase migration up --linked
```

Verify 27 migrations applied.

## Step 6: Start Dev Server

```bash
npm.cmd run dev
```

App runs at http://localhost:4173

## Step 7: Register Telegram Webhook

```bash
curl -F "url=http://localhost:4173/api/telegram" \
  https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
```

## Step 8: Verify Setup

Send `/provider-status` to your Telegram bot.
All 5 providers should show as enabled.

## Step 9: Extract Provider Cookies

```bash
node node_modules\tsx\dist\cli.mjs scripts/refresh-cookies.ts
```

This extracts cookies from Edge Profile 3 and updates your `.env`.

## Troubleshooting

### Build fails

- Ensure Node.js 22+ is installed
- Delete `node_modules` and re-run `npm.cmd install`

### Database connection fails

- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
- Run `npx.cmd supabase migration up --linked`

### Telegram bot not responding

- Verify webhook is set: `curl https://api.telegram.org/bot$TOKEN/getWebhookInfo`
- Verify `TELEGRAM_BOT_TOKEN` is correct

### Playwright browser not found

- Run `npx.cmd playwright install chromium`
- Or: `npx.cmd playwright install --with-deps`

### Redis not available

- Queues fall back to inline execution automatically
- Start Redis via Docker to enable queues
