# Architecture — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29  
> **Production URL:** https://valtrexa-v2.vercel.app

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Vercel (SSR + API)                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ Frontend │  │ API Routes   │  │ Server-Side Rendering     │  │
│  │ TanStack │  │ [...route].ts│  │ Nitro (TanStack Start)   │  │
│  │ Start    │  │              │  │                           │  │
│  └──────────┘  └──────┬───────┘  └───────────────────────────┘  │
└───────────────────────┼─────────────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────────────┐
│              ┌────────┴────────┐                                │
│              │  Supabase       │    ┌──────────────────┐        │
│              │  (PostgreSQL)   │    │  Railway Worker  │        │
│              │  + Auth         │    │  (BullMQ + Redis)│        │
│              └─────────────────┘    └────────┬─────────┘        │
│                                              │                  │
│  ┌───────────┐ ┌──────────┐ ┌─────────────┐ │                  │
│  │ Telegram  │ │ Gmail    │ │ OpenRouter  │ │                  │
│  │ Bot API   │ │ API      │ │ AI          │ │                  │
│  └───────────┘ └──────────┘ └─────────────┘ │                  │
└──────────────────────────────────────────────┼──────────────────┘
                                               │
                          ┌────────────────────┘
                          ▼
              ┌──────────────────────┐
              │  Job Boards          │
              │  (LinkedIn, Indeed,  │
              │   Naukri, Wellfound, │
              │   Instahyre)         │
              └──────────────────────┘
```

## Key Design Decisions

### 1. Cookie-Based Provider Authentication

Job portals use session cookies, not API tokens. VALTREXA-V2 stores encrypted cookies per-user:

- Encrypted with AES-256-GCM (`COOKIE_ENCRYPTION_KEY`)
- Stored in `provider_cookies` table with per-user RLS
- Decrypted at runtime for Playwright automation
- HTTP-based cookie validation (not heuristic page parsing)

### 2. Service Role + RLS

All server code uses `supabaseAdmin` (service role key) which bypasses RLS. User isolation is enforced in code via `.eq("user_id", userId)` on every query. 145+ write operations audited — zero unscoped writes.

### 3. Dual Pipeline Architecture

**Pipeline A (Auto-Apply):**

- 5 job boards, 3 strategies (conservative, balanced, aggressive)
- Playwright browser automation for form filling
- Screenshot + HTML evidence capture
- Resume upload via temp file download

**Pipeline B (High-Value Outreach):**

- Recruiter discovery + email finding
- AI-generated personalized outreach (OpenRouter)
- Gmail API for sending + inbox classification
- Follow-up cadence (Day 3/7/14)

### 4. Multi-User Isolation

- All tables have RLS policies: `user_id = auth.uid()`
- Service role queries always include `.eq("user_id", userId)`
- `provider_controls` migrated from global to per-user (`UNIQUE(user_id, provider)`)
- `provider_health_log` has `user_id` column with index
- Telegram bindings: `UNIQUE(user_id)`, `UNIQUE(chat_id)`
- **Telegram inbound is purely binding-based** — `resolveUserIdFromTelegramChat` looks up `telegram_bindings.chat_id` → `user_id`. Removed legacy `TELEGRAM_USER_ID` env-var fallback. Unbound chats get a "not connected" prompt.
- **Outbound notifications** use `getChatIdForUser(userId)` → `telegram_bindings.chat_id` per-user. Admin alerts use global `TELEGRAM_CHAT_ID` env var.

## Technology Stack

| Layer    | Technology               | Version |
| -------- | ------------------------ | ------- |
| Frontend | TanStack Start + React   | 19.x    |
| SSR      | Nitro (Vite)             | 7.x     |
| Database | Supabase (PostgreSQL)    | 15.x    |
| Auth     | Supabase Auth            | —       |
| AI       | OpenRouter (GPT-4o-mini) | —       |
| Bot      | Telegram Bot API         | —       |
| Email    | Gmail API                | —       |
| Queue    | BullMQ + Redis           | —       |
| Browser  | Playwright (Chromium)    | latest  |
| Hosting  | Vercel + Railway         | —       |
