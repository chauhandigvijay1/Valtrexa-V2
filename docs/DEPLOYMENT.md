# Deployment Guide

This document covers deploying VALTREXA-V2 to production.

## Target: Vercel (Recommended)

The project is pre-configured for Vercel deployment. Nitro SSR handles all API and rendering.

## Pre-Deployment Checklist

- [ ] Run `npm.cmd run build` — must succeed with `✓ built in X.XXs`
- [ ] Run `node node_modules\tsx\dist\cli.mjs scripts/validate-provider-controls.ts` — 80/80 must pass
- [ ] Run `node node_modules\tsx\dist\cli.mjs scripts/e2e-playwright-real.ts` — 43/43 must pass
- [ ] Verify all 5 provider cookies are present in `.env`
- [ ] Verify Supabase migrations are applied: `npx.cmd supabase migration up --linked`
- [ ] Verify n8n is running: `curl http://127.0.0.1:5678/healthz`
- [ ] Verify Redis is running: `redis-cli ping` → PONG
- [ ] Verify `.gitignore` covers `.env`, `supabase/.temp/`, `dist/`, `node_modules`

## Deployment Steps

### 1. GitHub Push

```bash
git add .
git commit -m "Production deployment"
git push origin main
```

### 2. Vercel Import

1. Go to https://vercel.com/new
2. Import the GitHub repository
3. Framework preset: **Other** (TanStack Start/Nitro)
4. Build command: `npm run build` (pre-configured in vercel.json)
5. Output directory: `dist/client` (pre-configured in vercel.json)
6. Environment variables: see Section 3

### 3. Environment Variables

Set ALL of these in Vercel dashboard:

| Variable | Value | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | Your Supabase project URL | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key | Required, keep secret |
| `SESSION_SECRET` | Random 64-char hex string | Required |
| `TELEGRAM_BOT_TOKEN` | From BotFather | For Telegram |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID | For Telegram |
| `PUBLIC_URL` | `https://your-app.vercel.app` | Set AFTER deploy |
| `N8N_WEBHOOK_URL` | Your n8n instance URL | For n8n |
| `N8N_API_KEY` | n8n API key | For n8n auth |
| `LINKEDIN_COOKIE` | 2392-char cookie string | For LinkedIn |
| `INDEED_COOKIE` | 4778-char cookie string | For Indeed |
| `NAUKRI_COOKIE` | 1156-char cookie string | For Naukri |
| `WELLFOUND_COOKIE` | 2691-char cookie string | For Wellfound |
| `INSTAHYRE_COOKIE` | 245-char cookie string | For Instahyre |
| `GMAIL_CLIENT_ID` | Google OAuth client ID | For Gmail |
| `GMAIL_CLIENT_SECRET` | Google OAuth secret | For Gmail |
| `GMAIL_REFRESH_TOKEN` | Google OAuth refresh | For Gmail |
| `GMAIL_REDIRECT_URI` | `$PUBLIC_URL/api/auth/gmail/callback` | See section 6 |
| `NITRO_PRESET` | `vercel` | Required for Vercel SSR |
| `REDIS_URL` | Redis connection string | For BullMQ |
| `ENABLE_TELEGRAM_APPROVALS` | `true` | To enable approvals |

### 4. Post-Deployment

#### 4a. Register Telegram Webhook

```bash
curl -F "url=$PUBLIC_URL/api/telegram" \
  https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

#### 4b. Verify Telegram Commands

Send `/provider-status` to your Telegram bot.
Expected: All 5 providers listed (linkedin disabled, others enabled).

Send `/health` to verify system health.

#### 4c. Verify n8n Connectivity

```bash
curl $PUBLIC_URL/api/n8n/webhooks
```

Expected: List of registered webhooks.

#### 4d. Update Gmail Redirect URI

In Google Cloud Console, update the authorized redirect URI to:
```
https://your-app.vercel.app/api/auth/gmail/callback
```

### 5. First Production Run

1. Send `/provider-enable linkedin` via Telegram (if needed for import only)
2. Import jobs from a provider
3. Verify jobs appear: `/jobs`
4. Run a test match
5. Submit an application in approval mode
6. Verify Telegram notification arrives

## Deployment to Railway (Alternative)

```bash
# Add Redis plugin in Railway dashboard
# Set NITRO_PRESET=node-server
# Railway auto-detects Node.js projects
```

## Deployment to Render (Alternative)

```bash
# Create render.yaml or use Blueprint
# Set NITRO_PRESET=node-server
# Add Redis sidecar or use Render Managed Redis
```

## Troubleshooting

### Build fails
- Ensure `NITRO_PRESET=vercel` is set
- Run `npm install` locally first
- Check Node.js version (22+)

### 404 on API routes
- Verify `vercel.json` rewrites are correct
- Check `api/_dist/` was created during build

### n8n webhook 404
- Verify `N8N_WEBHOOK_URL` includes the full path
- Check n8n instance is running and reachable

### Telegram commands not responding
- Verify webhook URL was set correctly
- Send any message to the bot first to wake it up
- Check `TELEGRAM_BOT_TOKEN` is correct
