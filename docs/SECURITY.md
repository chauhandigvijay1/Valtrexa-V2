# VALTREXA-V2 Security

---

## Authentication

VALTREXA-V2 uses **Supabase Auth** as its primary authentication provider.

- **Email/Password** — Standard Supabase Auth with email/password sign-in.
- **Google OAuth** — Social login via Google, configured in the Supabase dashboard.
- **Session Tokens** — Supabase issues JWT access tokens. The frontend stores them via the Supabase client and attaches them as `Authorization: Bearer <token>` headers on API requests.

Session refresh is handled automatically by the Supabase JS client.

### Session Validation

All protected API routes call `requireApiUser(request)` from `api/_lib/auth.ts`:

1. Extracts the `Authorization` header.
2. Calls `supabaseAdmin.auth.getUser(token)` to validate the JWT against Supabase.
3. Returns `{ id, email }` on success, or throws a **401 Response** on failure.

Token expiry and invalid token patterns are detected and reported via the failure detection system (`api/_lib/failure-detection.ts`).

---

## API Authentication

The `requireApiUser` middleware protects every handler. There are no unprotected mutation endpoints. The middleware pattern is consistent across all routes:

```typescript
const user = await requireApiUser(request);
```

The client-side `apiGet`/`apiPost` helpers in `src/lib/api-client.ts` automatically attach the bearer token from the Supabase session.

---

## Service Role Key

The Supabase **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) is used exclusively on the server side (`api/_lib/supabase.ts`). This key bypasses Row Level Security and must never be exposed to clients:

- Used in `supabaseAdmin` client for all backend database operations.
- Configured via `SUPABASE_SERVICE_ROLE_KEY` environment variable (server-only).
- Not included in frontend bundle — only `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) is available client-side.

---

## Environment Variable Security

Sensitive environment variables are documented in `.env.example` and include:

### Session & Auth Secrets

| Variable                    | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `SESSION_SECRET`            | Server-side session signing key         |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin bypass key (server-only) |

### API Keys

| Variable                             | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `OPENROUTER_API_KEY`                 | OpenRouter AI provider authorization |
| `GROQ_API_KEY`                       | Groq AI provider authorization       |
| `GREENHOUSE_API_KEY`                 | Greenhouse Harvest API key           |
| `LEVER_API_KEY` / `LEVER_SITE_TOKEN` | Lever ATS integration                |
| `ASHBY_API_KEY`                      | Ashby job board integration          |
| `WORKABLE_API_KEY`                   | Workable API integration             |
| `LINKEDIN_API_KEY`                   | LinkedIn API integration             |
| `INDEED_API_KEY`                     | Indeed API integration               |

### Provider Cookies

| Variable           | Purpose                              |
| ------------------ | ------------------------------------ |
| `LINKEDIN_COOKIE`  | LinkedIn session cookie for scraping |
| `WELLFOUND_COOKIE` | Wellfound session cookie             |
| `INDEED_COOKIE`    | Indeed session cookie                |
| `NAUKRI_COOKIE`    | Naukri session cookie                |
| `INSTAHYRE_COOKIE` | Instahyre session cookie             |

### Gmail OAuth Credentials

| Variable              | Purpose                              |
| --------------------- | ------------------------------------ |
| `GMAIL_CLIENT_ID`     | Google OAuth client ID               |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret           |
| `GMAIL_REFRESH_TOKEN` | OAuth refresh token (offline access) |

### Telegram Bot Token

| Variable             | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token for notifications and commands |

All environment variables are loaded from `.env` and `.env.local` files at startup via `api/_lib/env.ts`. Production deployments should use the platform's secret management (e.g., Vercel Environment Variables, Docker secrets).

---

## Row Level Security (RLS)

VALTREXA-V2 uses Supabase RLS policies for multi-tenant data isolation. All database operations include the `user_id` filter:

```typescript
supabaseAdmin.from("jobs").select("*").eq("user_id", user.id);
```

Key tables with user-scoped access:

- `jobs` — job listings scoped by `user_id`
- `recruiters` — recruiter contacts scoped by `user_id`
- `applications` — application records scoped by `user_id`
- `companies` — company research scoped by `user_id`
- `candidate_profiles` — candidate brain data scoped by `user_id`
- `inbox_messages` — Gmail synced messages scoped by `user_id`
- `followups` — follow-up schedules scoped by `user_id`
- `integrations` — provider credentials scoped by `user_id`

The `supabaseAdmin` client uses the service role key which bypasses RLS. All user-scoped filtering is enforced application-side to prevent cross-tenant data access.

---

## Webhook HMAC Signatures

Outgoing webhook deliveries (via `api/_lib/event-bus.ts` and `api/_lib/workflow-events.ts`) include an HMAC-style signature header:

```
x-valtrexa-v2-secret: <consumer-secret>
```

When a webhook consumer is registered, an optional `secret` is stored. This secret is included in the HTTP headers of every webhook delivery, allowing the receiving endpoint to verify the request originated from VALTREXA-V2.

Event bus consumers support types:

- `telegram` — Message delivery to Telegram chat
- `worker` — Internal queue worker processing

---

## Telegram Bot Token Security

The Telegram bot token (`TELEGRAM_BOT_TOKEN`) is used server-side only:

- Stored in environment variables, never exposed to clients.
- Used to call the Telegram Bot API for sending notifications and processing commands.
- The webhook endpoint (`/api/telegram/webhook`) is registered at startup via `initTelegramBot()` when `PUBLIC_URL` is configured.
- Bot commands include provider management (`/provider-enable`, `/provider-disable`, `/provider-pause`) which modify provider state.

The Telegram operations module (`api/_lib/telegram.ts`) uses the token to authenticate all API calls to `https://api.telegram.org/bot<token>/`.

---

## Provider Cookie Storage and Rotation

Provider session cookies (LinkedIn, Indeed, Naukri, Wellfound, Instahyre) are:

- Stored in environment variables as raw cookie strings.
- Used by Playwright-based browser automation to establish authenticated sessions.
- Stored persistently via `browser_profiles` table after manual login capture.

The Playwright platform module (`api/_lib/playwright-platform.ts`) manages:

- **Storage state** — captured cookies and local storage are saved per provider per user.
- **Profile lifecycle** — profiles can be launched, captured, listed, and deleted.
- **Expiry detection** — failure detection (`api/_lib/failure-detection.ts`) identifies token/cookie expiry patterns (`/token.*expired/i`, `/invalid.*token/i`).

The provider control system (`api/_lib/provider-controls.ts`) automatically disables providers after **3 consecutive failures** (configurable threshold). Auto-disabled providers can be re-enabled via Telegram bot commands.

---

## Rate Limiting

Rate limiting is implemented in `api/_lib/rate-limiter.ts`:

- **Window**: 60 seconds (configurable via `RATE_LIMIT_WINDOW_MS`).
- **Max requests**: 100 per window (configurable via `RATE_LIMIT_MAX_REQUESTS`).
- **Key**: Client IP address (extracted from `x-forwarded-for` header).
- **Response**: HTTP 429 with `retry-after` and `x-ratelimit-remaining` headers.

The `safeRouteRequest` wrapper in `api/[...route].ts` applies rate limiting to every API call before routing. Health check and Telegram webhook endpoints are excluded from rate limit logging in Sentry.

Rate limit state is stored in-memory (Map). For production multi-instance deployments, a Redis-backed rate limiter should be considered.

---

## Input Validation Approach

All API handlers validate inputs at the method level and payload level:

- **HTTP Method Validation**: Each handler checks `request.method` and returns `405 Method Not Allowed` for unsupported methods.
- **JSON Payload Parsing**: `readJson<T>()` parses and type-coerces request bodies. Invalid JSON returns a parse error.
- **Required Field Checks**: Handlers validate required fields and return `400` with descriptive error messages.
- **TypeScript Type Safety**: Payload types are defined at each handler boundary (e.g., `readJson<{ jobId: string }>(request)`).

Input validation is application-level rather than using a schema validation library. Critical paths include explicit checks:

```typescript
if (!body.jobId) return json({ error: "jobId required" }, { status: 400 });
if (!QUEUE_NAMES.includes(body.queue)) return json({ error: "Invalid queue." }, { status: 400 });
```

### SQL Injection Prevention

All database queries use parameterized queries via the Supabase client. User input is passed as query parameters rather than interpolated into SQL strings. ILIKE patterns use Supabase's `.ilike()` method which is parameterized internally.

### IDOR Prevention

All resource queries include the authenticated user's ID:

```typescript
.eq("user_id", user.id)
```

This prevents horizontal privilege escalation where one user could access another user's data.
