<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/favicon.svg">
    <img src="assets/favicon.svg" alt="Valtrexa V2" width="64" height="64">
  </picture>
</p>

<h1 align="center">Environment Variables — VALTREXA-V2</h1>

<p align="center">
  <strong>Version:</strong> v1.0.0 &nbsp;•&nbsp;
  <strong>Last updated:</strong> 2026-06-29
</p>

---

## Table of Contents

- [Overview](#overview)
- [1. Supabase](#1-supabase)
- [2. Application](#2-application)
- [3. Telegram Bot](#3-telegram-bot)
- [4. Encryption & Security](#4-encryption--security)
- [5. AI / LLM Providers](#5-ai--llm-providers)
- [6. Gmail OAuth](#6-gmail-oauth)
- [7. Playwright / Browser Automation](#7-playwright--browser-automation)
- [8. Redis / Queue](#8-redis--queue)
- [9. Monitoring](#9-monitoring)
- [10. Feature Flags](#10-feature-flags)
- [11. Vercel Auto-Provided](#11-vercel-auto-provided)
- [Architecture Diagram](#architecture-diagram)
- [Best Practices](#best-practices)

---

## Overview

> [!IMPORTANT]
> All environment variables are loaded from `.env` (overridden by `.env.local`).
> **Production** values are set in Vercel/Railway dashboard — never commit secrets.

```mermaid
graph LR
    A[.env] --> B[.env.local]
    B --> C[process.env]
    C --> D[Config Module]
    D --> E[API Routes]
    D --> F[Workers]
    D --> G[Browser Automation]
```

## 1. Supabase

| Variable                    | Required | Production Value            | Notes                              |
| --------------------------- | -------- | --------------------------- | ---------------------------------- |
| `SUPABASE_URL`              | **Yes**  | Your Supabase project URL   | `https://<project>.supabase.co`    |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes**  | Your service_role key       | **Never expose to client**         |
| `SUPABASE_ANON_KEY`         | **Yes**  | Your anon key               | Safe for client use (RLS enforces) |
| `SUPABASE_PUBLISHABLE_KEY`  | No       | Same as `SUPABASE_ANON_KEY` | Alias for frontend                 |

> [!WARNING]
> `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS policies. Only use it in server-side code or queue workers. Never expose it to the browser or client-side JavaScript.

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
| `TELEGRAM_CHAT_ID`        | Legacy   | Your Telegram chat ID  | Admin alerting only (outbound). NOT used for inbound user resolution                                       |

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

> [!WARNING]
> **Gmail is single-mailbox only.** The system uses one shared Gmail account configured via env vars. Multi-tenant Gmail is not supported.

> [!WARNING]
> **No per-provider cookie env vars.** `LINKEDIN_COOKIE`, `INDEED_COOKIE`, `NAUKRI_COOKIE`, `WELLFOUND_COOKIE`, `INSTAHYRE_COOKIE` were removed in v1.0.1. All provider cookies are per-user encrypted in `provider_cookies` table. Each user must add cookies via dashboard Settings or Telegram `/refresh_cookies`.

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

> [!NOTE]
> These are set automatically by Vercel — do not add them to your `.env` file:

- `VERCEL=1`
- `VERCEL_ENV=production`
- `VERCEL_URL=valtrexa-v2.vercel.app`

## Architecture Diagram

```mermaid
graph TD
    Env[.env / .env.local] --> Config[Configuration Loader]
    Config --> Supabase[Supabase Client]
    Config --> Redis[Redis Connection]
    Config --> LLM[LLM Provider Router]
    Config --> Gmail[Gmail OAuth Client]
    Config --> Telegram[Telegram Bot]
    Config --> Sentry[Sentry Error Tracking]
    Config --> RateLimit[Rate Limiter]
    Config --> Playwright[Playwright Browser]
```

## Best Practices

> [!TIP]
> **Secret rotation:** Rotate `SESSION_SECRET`, `COOKIE_ENCRYPTION_KEY`, and `TELEGRAM_WEBHOOK_SECRET` every 90 days. Use a password manager to generate and store them.

> [!WARNING]
> **Never commit `.env` files.** The repository `.gitignore` already excludes `.env` and `.env.local`, but verify before every commit with `git status`.

> [!NOTE]
> **Local development:** Copy `.env.example` to `.env.local` and fill in values. The `.env.local` file takes precedence over `.env` and is also git-ignored.

- Use different Supabase projects for development, staging, and production.
- Set `LOG_LEVEL=debug` during development to see all Pino logs — switch to `info` or `warn` in production.
- Monitor Redis connection via the `/api/admin/queues` endpoint — connection drops will cause worker failures.
- Keep `PLAYWRIGHT_HEADLESS=true` in production — headless mode uses fewer resources and is more reliable on servers.

---

<br/>
<div align="center">
  <strong>Next Reading:</strong> <a href="WORKFLOW.md">Workflow Engine →</a>
</div>
