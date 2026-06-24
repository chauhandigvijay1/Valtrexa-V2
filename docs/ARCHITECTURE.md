# VALTREXA-V2 Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          Browser (React SPA + SSR)                               │
│            TanStack Start · React Router · React Query · Tailwind v4             │
└───────────────────────────┬──────────────────────────────────────────────────────┘
                            │ SSR / API calls
┌───────────────────────────▼──────────────────────────────────────────────────────┐
│                         Nitro / Vinxi Server (Vercel SSR)                        │
│                                                                                  │
│  api/[...route].ts       — File-based routing, 70+ REST endpoints               │
│  api/phase-handlers.ts   — Phase A + B handler orchestration                    │
│  api/_lib/               — All business logic (42 modules)                      │
│  api/ssr.ts              — Production SSR entry (TanStack Start → Vercel)       │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐      │
│  │                      Background Workers (BullMQ + inline)               │      │
│  │  job-worker.ts · apply-worker.ts · recruiter-worker.ts                  │      │
│  │  outreach-worker.ts · followup-worker.ts · gmail-worker.ts              │      │
│  │  analytics-worker.ts                                                    │      │
│  └────────────────────────────────────────────────────────────────────────┘      │
└──────┬──────────────────────────────┬──────────────────────┬──────────────────────┘
       │                              │                      │
  ┌────▼────────┐              ┌──────▼───────┐        ┌─────▼────────┐
  │  Supabase   │              │    Redis     │        │     n8n      │
  │  PostgreSQL │              │   BullMQ     │        │   Workflow   │
  │  Storage    │              │   Queues     │        │   Engine     │
  │  Auth       │              │  (7 queues)  │        │              │
  └─────────────┘              └──────────────┘        └──────┬───────┘
                                                              │
                                                         ┌────▼───────┐
                                                         │  Telegram  │
                                                         │  Bot API   │
                                                         └────────────┘
```

## Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | TanStack Start (React 19), TanStack Router, TanStack React Query, Tailwind CSS v4, shadcn/ui (Radix Primitives), Zustand, react-hook-form + zod |
| **SSR / API Server** | Vinxi / Nitro (beta) — file-based routing via `api/[...route].ts` |
| **Bundler** | Vite 7 |
| **Database** | Supabase (PostgreSQL + Auth + Storage) |
| **Queue & Background Jobs** | BullMQ (Redis 7) with inline fallback when Redis is unreachable |
| **Browser Automation** | Playwright (persistent sessions, cookie management, multi-provider) |
| **AI Layer** | OpenRouter (multi-model with free-tier fallback chain), Gemini, Anthropic |
| **Workflow Automation** | n8n (self-hosted via Docker) |
| **Notifications** | Telegram Bot API |
| **Monitoring** | Sentry (node + react), Pino (structured logging) |
| **Testing** | Vitest |
| **Linting** | ESLint + Prettier + TypeScript |

## Directory Structure

```
VALTREXA-V2/
├── api/                          # SSR + API (Nitro file-based routing)
│   ├── [...route].ts             # Catch-all router → dispatches 70+ handlers
│   ├── phase-handlers.ts         # Orchestrator: Phase A + B handler functions
│   ├── ssr.ts                    # Production entry: Vercel serverless function
│   ├── ssr.d.ts                  # Type declarations for SSR module
│   ├── _lib/                     # Business logic modules (42 files)
│   │   ├── queue.ts              # BullMQ registry + inline fallback
│   │   ├── workflow-events.ts    # Event bus → webhook push + followup scheduling
│   │   ├── event-bus.ts          # Consumer registry, delivery history, replay
│   │   ├── openrouter.ts         # OpenRouter client with free-model fallback chain
│   │   ├── ai-provider.ts        # Multi-provider AI abstraction (Gemini, Anthropic, etc.)
│   │   ├── ai-fallbacks.ts       # Deterministic fallbacks when AI is unavailable
│   │   ├── playwright-platform.ts # Browser profile manager, cookie storage
│   │   ├── playwright-apply.ts   # Automated application submission via Playwright
│   │   ├── apply-engine.ts       # Application orchestration (build + submit)
│   │   ├── batch-apply-engine.ts # Multi-provider batch pipeline
│   │   ├── providers.ts          # Provider abstraction (JobProvider, RecruiterProvider, ApplicationProvider)
│   │   ├── provider-controls.ts  # Enable/disable/pause/maintenance per provider
│   │   ├── job-sources.ts        # Job import: Greenhouse, Lever, Ashby, HTML fallback
│   │   ├── workable-source.ts    # Workable job import
│   │   ├── recruiter-discovery.ts# AI + fallback recruiter contact discovery
│   │   ├── email-discovery.ts    # Email verification for recruiters
│   │   ├── match-engine.ts       # Resume-to-job match scoring
│   │   ├── high-value-engine.ts  # Strategic value computation (AI-driven)
│   │   ├── outreach-engine.ts    # AI-generated outreach draft generation
│   │   ├── outreach-sender.ts    # Multi-channel outreach delivery
│   │   ├── followup-engine.ts    # Automated follow-up cadence (3/7/14 day)
│   │   ├── inbox-intelligence.ts # Gmail sync + message classification
│   │   ├── role-taxonomy.ts      # Role categorization
│   │   ├── skill-gap.ts          # Skill gap analysis
│   │   ├── resume-parser.ts      # Resume parsing + structured extraction
│   │   ├── failure-detection.ts  # Auto-detect CAPTCHA, expired cookies, provider errors
│   │   ├── self-healing.ts       # Retry wrappers + fallback selectors
│   │   ├── alerting.ts           # Telegram alert dispatch
│   │   ├── telegram.ts           # Bot command handler + Telegram notification dispatcher
│   │   ├── telegram-init.ts      # Bot initialization + webhook registration
│   │   ├── auth.ts               # Supabase JWT auth middleware (requireApiUser)
│   │   ├── http.ts               # Request/response helpers (json, readJson, methodNotAllowed)
│   │   ├── supabase.ts           # Supabase admin client singleton
│   │   ├── env.ts                # Environment variable validation
│   │   ├── logger.ts             # Pino structured logger
│   │   ├── rate-limiter.ts       # Per-user rate limiting
│   │   ├── retry.ts              # Generic retry with exponential backoff
│   │   ├── job-resolver.ts       # Job metadata resolution
│   │   ├── compat.ts             # Compatibility layer
│   │   ├── auto-migrate.ts       # Database migration runner
│   │   ├── sentry.ts             # Sentry error reporting
│   │   ├── config.ts             # Assert configuration at start
│   │   └── workers/              # BullMQ worker definitions (7 workers)
│   │       ├── job-worker.ts
│   │       ├── apply-worker.ts
│   │       ├── recruiter-worker.ts
│   │       ├── outreach-worker.ts
│   │       ├── followup-worker.ts
│   │       ├── gmail-worker.ts
│   │       └── analytics-worker.ts
│   └── _dist/                    # Build output (generated)
├── src/                          # Frontend (TanStack Start)
│   ├── start.ts                  # Vite entry point
│   ├── server.ts                 # TanStack Start server entry
│   ├── router.tsx                # Router instance
│   ├── routeTree.gen.ts          # Generated route tree
│   ├── styles.css                # Global styles + Tailwind directives
│   ├── routes/                   # File-based routes
│   │   ├── __root.tsx            # Root layout
│   │   ├── _authenticated.tsx    # Auth layout wrapper
│   │   ├── _authenticated/       # Authenticated pages (16 pages)
│   │   │   ├── dashboard.tsx
│   │   │   ├── job-matches.tsx
│   │   │   ├── applications.tsx
│   │   │   ├── opportunities.tsx
│   │   │   ├── outreach.tsx
│   │   │   ├── recruiters.tsx
│   │   │   ├── interviews.tsx
│   │   │   ├── company-research.tsx
│   │   │   ├── painpoints.tsx
│   │   │   ├── skills.tsx
│   │   │   ├── resumes.tsx
│   │   │   ├── profile.tsx
│   │   │   ├── settings.tsx
│   │   │   ├── analytics.tsx
│   │   │   ├── projects.tsx
│   │   │   └── interview-prep.tsx
│   │   ├── index.tsx             # Landing page
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   ├── forgot-password.tsx
│   │   └── reset-password.tsx
│   ├── components/               # Shared UI components
│   │   ├── ui/                   # 46 shadcn/ui primitives (Radix-based)
│   │   ├── app-sidebar.tsx
│   │   ├── crud-shell.tsx
│   │   ├── page-header.tsx
│   │   └── role-multi-select.tsx
│   ├── hooks/                    # Custom React hooks
│   ├── integrations/             # Third-party integrations
│   │   └── supabase/             # Supabase client + typed queries
│   └── lib/                      # Frontend utilities
│       ├── api-client.ts         # Typed API client (apiGet, apiPost)
│       ├── api/                  # Generated API function bindings
│       ├── auth-callback.ts      # Auth callback handler
│       ├── utils.ts              # cn() etc.
│       ├── error-page.ts
│       ├── error-capture.ts
│       ├── workflow-intelligence.ts
│       ├── role-taxonomy.ts
│       └── config.server.ts
├── scripts/                      # Build & deployment scripts
│   ├── prepare-vercel-ssr.mjs    # Vercel SSR bundle preparation
│   └── verify-pre-n8n.ts         # Pre-n8n deployment verification
├── supabase/                     # Supabase CLI config + migrations
├── docs/                         # Documentation
├── package.json
├── README.md
└── .env.example
```

## API Architecture

### File-Based Routing via `api/[...route].ts`

The API uses Vinxi/Nitro's catch-all route pattern. A single file `api/[...route].ts` receives all requests and dispatches them to the appropriate handler in `api/phase-handlers.ts` based on URL path and HTTP method.

- **Authentication**: Every handler calls `requireApiUser(request)` which extracts a Supabase JWT from the `Authorization: Bearer <token>` header.
- **Response helpers**: `json()`, `readJson()`, `methodNotAllowed()` in `api/_lib/http.ts`.
- **Phase A handlers** (Provider Audit, Credentials, Config, Job Sources, Job Integration, Strategy):
  - `handleProviderAudit` — list all providers with capability + config status
  - `handleProviderSearchJobs` — import jobs from a specific provider
  - `handleProviderIntegrationConfig` — save/load per-provider credentials
  - `handleProviderControls` — enable/disable/pause provider
  - `handleStrategyConfig` — per-user batch strategy settings
- **Phase B handlers** (Matches, Applications, Batch Apply, Outreach, Recruiters, Followups, Inbox, Browser):
  - `handleComputeMatchScore` — AI-driven resume-to-job scoring
  - `handleHighValueTargets` — strategic value computation
  - `handleSubmitApplication` — build application package + submit via Playwright
  - `handleBatchApply` — multi-provider batch application pipeline
  - `handleDiscoverRecruiters` — AI + fallback recruiter discovery
  - `handleGenerateOutreach` — outreach draft generation
  - `handleScheduleFollowups` — cadence-based follow-up scheduling
  - `handleDueFollowups` — fetch follow-ups that are due
  - `handleSyncInbox` — Gmail inbox sync + classification
  - `handleLaunchBrowserContext` — launch authenticated Playwright session

### Phase Handler Pattern

```typescript
export async function handleSomeAction(request: Request) {
  const user = await requireApiUser(request);            // auth
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const body = await readJson(request);                   // parse
  const result = await someEngine(user, body);            // business logic
  return json(result);                                    // respond
}
```

## Background Jobs / Queue Architecture

### BullMQ + Inline Fallback

Defined in `api/_lib/queue.ts`. Seven named queues:

| Queue | Purpose | Worker |
|-------|---------|--------|
| `job-import` | Import jobs from ATS providers | `job-worker.ts` |
| `apply` | Submit applications (batch) | `apply-worker.ts` |
| `recruiter` | Discover recruiter contacts | `recruiter-worker.ts` |
| `outreach` | Send outreach messages | `outreach-worker.ts` |
| `followup` | Process follow-up cadence | `followup-worker.ts` |
| `gmail` | Sync Gmail inbox | `gmail-worker.ts` |
| `analytics` | Compute analytics aggregates | `analytics-worker.ts` |

**Redis fallback**: If `REDIS_URL` is unreachable (serverless / no-Redis deploys), the queue system degrades to **inline execution** — the `enqueue()` function accepts a `runInline` callback that runs the job synchronously in the request thread. An audit trail is always written to the `queue_jobs` DB table regardless of Redis availability.

```typescript
await enqueue("apply", "batch-apply", data, {
  userId: user.id,
  runInline: (data) => runBatchApplyInline(data),  // fallback if Redis is down
});
```

## Job Provider Integration Architecture

### Provider Abstraction (`api/_lib/providers.ts`)

Three interfaces define the full platform capability surface:

- **`JobProvider`** — import job listings from ATS boards
- **`RecruiterProvider`** — discover recruiter/hiring-manager/founder contacts
- **`ApplicationProvider`** — submit applications through the provider

**Auth methods**: `public_board`, `session_cookie`, `api_key`, `oauth`, `none`

**Supported providers** (from `PROVIDER_REGISTRY`):
- Greenhouse (public feed + Harvest API)
- Lever (public API)
- Ashby (public API)
- Workable (public API)
- LinkedIn (browser automation via Playwright)
- Naukri (browser automation)
- Wellfound (browser automation)
- Indeed (browser automation)
- Instahyre (browser automation)
- Gmail (OAuth — inbox intelligence)

### Playwright-Based Browser Automation

Defined in `api/_lib/playwright-platform.ts`:

- **Cookie management**: Per-provider cookie env vars (e.g. `LINKEDIN_COOKIE`, `NAUKRI_COOKIE`) are parsed into Playwright cookie objects and injected into browser contexts.
- **Storage state persistence**: Sessions are stored in the `browser_sessions` Supabase table, enabling cross-run reuse.
- **Graceful degradation**: If Playwright is unavailable (serverless), every function returns a structured status rather than crashing.
- **Browser profiles**: `listBrowserProfiles()`, `deleteBrowserProfile()`, `saveCapturedStorageState()` for lifecycle management.

### Provider Controls (`api/_lib/provider-controls.ts`)

Every provider can be independently managed:
- **Statuses**: `enabled`, `disabled`, `paused (maintenance)`
- **Health tracking**: Per-provider success/failure metrics, health log
- **Telegram commands**: `/provider-status`, `/provider-enable`, `/provider-disable`, `/provider-pause`, `/provider-resume`, `/provider-history`

### Failure Detection & Self-Healing

`api/_lib/failure-detection.ts` automatically detects:
- CAPTCHA challenges
- Expired/broken cookies
- Rate-limit responses
- Provider-specific error patterns

`api/_lib/self-healing.ts` provides retry wrappers and fallback selectors that auto-switch to alternative providers when one fails.

## AI Integration

### Multi-Provider AI (`api/_lib/ai-provider.ts`, `api/_lib/openrouter.ts`)

**`AiProvider` interface** — uniform contract for all AI backends:
- `generateText()` — free-form text generation
- `generateJson()` — structured JSON generation with schema validation
- `healthCheck()` — per-provider health
- `getMetrics()` — usage tracking (total/successful/failed calls, avg latency)

**Implemented providers**:
- **OpenRouter** (primary) — multi-model with free-tier fallback chain
- **Gemini** — via GEMINI_API_KEY
- Additional providers follow the same interface

**OpenRouter fallback chain** (`api/_lib/openrouter.ts`):
```
preferred model → google/gemma-4-26b-a4b-it:free → qwen/qwen3-next-80b-a3b-instruct:free → nvidia/nemotron-nano-9b-v2:free
```
Each model gets 2 retry attempts with exponential backoff. 402/404/408/429/500+ status codes trigger model fallback.

**AI Fallbacks** (`api/_lib/ai-fallbacks.ts`):
Deterministic, rule-based implementations for company research, pain point extraction, and skill mapping when AI is unavailable — ensuring the platform works without any API key.

## Notification Pipeline

```
┌──────────┐    ┌──────────────┐    ┌─────────────────┐    ┌───────────┐    ┌──────────┐
│  Engine   │───▶│ Event Bus   │───▶│  SQL Subscribers │───▶│ n8n       │───▶│ Telegram  │
│ (apply,   │    │ workflow-   │    │  n8n_webhook_    │    │ Webhook   │    │ Bot       │
│  outreach,│    │ events.ts   │    │  subscriptions   │    │ Workflows │    │ API       │
│  followup)│    │             │    │                  │    │           │    │          │
└──────────┘    └──────┬───────┘    └─────────────────┘    └───────────┘    └──────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ workflow_events  │   DB table (persisted)
              │                  │
              │ workflow_event_  │   Delivery audit trail
              │ deliveries       │
              └──────────────────┘
```

1. An **engine** (e.g. `apply-engine.ts`) calls `emitWorkflowEvent()` with an event type (`application_created`, `outreach_sent`, etc.) and payload.
2. `workflow-events.ts` **persists** the event to the `workflow_events` table and **schedules follow-ups** (3/7/14 day cadence for `application_created`).
3. It then looks up **webhook subscriptions** from `n8n_webhook_subscriptions` that match the event type.
4. Webhooks are **fired via HTTP POST** to configured n8n webhook URLs.
5. n8n workflows process the event and can dispatch **Telegram notifications** via the Bot API.
6. Direct Telegram delivery is also supported via the `event-bus.ts` consumer system, which can deliver events to `telegram` consumers directly.

**Consumer types**: `webhook`, `n8n`, `telegram`, `worker`. Each delivery is recorded in `workflow_event_deliveries` for full auditability and UI visibility.

## Key Design Decisions

### 1. Redis as optional infrastructure
BullMQ is the primary queue backend, but the `enqueue()` function accepts a `runInline` callback that executes synchronously when Redis is unreachable. This allows the platform to run in serverless environments (Vercel, Render) without requiring a Redis instance.

### 2. File-based API routing
A single `[...route].ts` catch-all dispatches to 70+ handlers in `phase-handlers.ts`. This avoids Nitro's per-file routing while keeping a clean separation between routing and business logic.

### 3. Provider polymorphism via interfaces
Three interfaces (`JobProvider`, `RecruiterProvider`, `ApplicationProvider`) let each provider implement only the capabilities its upstream supports. The registry pattern (`PROVIDER_REGISTRY` + `getProvider()`) enables dynamic discovery and uniform management.

### 4. Browser automation with graceful degradation
Playwright manages authenticated sessions through cookie injection from env vars. If Playwright binaries are unavailable (serverless deployment), every automation function returns a structured "unavailable" status instead of crashing.

### 5. Per-provider health controls
Every provider has independent enable/disable/pause controls with health tracking. This allows isolating a failing provider without blocking the rest of the platform.

### 6. AI with automatic fallbacks
OpenRouter provides multi-model fallback chains (free tier → paid tier). The `AiProvider` interface allows multiple backends (Gemini, Anthropic). Deterministic fallbacks in `ai-fallbacks.ts` ensure core features work without any AI.

### 7. Event bus with webhook push + audit trail
Events are persisted in `workflow_events`, pushed to n8n webhooks for complex workflow automation, and tracked in `workflow_event_deliveries` for delivery auditing. This enables both real-time notifications and post-hoc debugging.

### 8. Telegram as primary notification channel
The Telegram bot handles both push notifications (via the event bus) and interactive commands (`/provider-status`, `/apply-now`, etc.). The bot authenticates via chat ID linked to the user's Telegram account and can execute platform operations directly from chat.

### 9. Supabase as single source of truth
All persistent state — user data, queue jobs, workflow events, browser sessions, provider configs, delivery history — lives in Supabase PostgreSQL. This avoids state fragmentation across Redis, n8n, and the database.

### 10. Single-phase request/response pattern
Every API handler follows the same pattern: `requireApiUser → method check → readJson → engine call → json response`. This uniformity makes adding new handlers predictable and testable.
