# VALTREXA-V2 API Reference

> **Internal API route documentation for developers.**  
> All API routes are prefixed with `/api/*` and handled by `api/[...route].ts`.

---

## Route Structure

All requests are dispatched by `api/[...route].ts` via the `routeRequest` function. The path is extracted from the URL and matched against a `switch` statement that delegates to the appropriate handler.

Handlers live in two locations:

- **`api/[...route].ts`** — inline handlers for resume processing, job import, company research, outreach, analytics, n8n webhooks, Telegram webhook, and legacy endpoints.
- **`api/phase-handlers.ts`** — Phase A (Data) and Phase B (Action) handlers wired after the initial route block.

---

## Phase A — Data Handlers

These endpoints prepare data for decision-making.

### Provider Audit

**`GET /api/providers/audit`**

Returns the full provider registry with each provider's auth method, capabilities, and credential status for the current user.

### Provider Import

**`POST /api/providers/import`**

Body: `{ sources: Array<{ source: string; ...config }> }`

Imports jobs from one or more supported providers (Greenhouse, Lever, Ashby, Workable, LinkedIn, Indeed, etc.). Deduplicates by `user_id + source + external_id`.

### Match Score

**`POST /api/match/score`**

Body: `{ jobId: string }`

Computes a match score between the user's candidate profile (skills, experience, location, salary) and a specific job. Updates the job's `match_score` column.

### Strategic Value

**`POST /api/companies/strategic-value`**

Body: `{ companyName: string }`

Computes a strategic value score and tier (HIGH / MEDIUM / LOW) for a target company based on hiring signals, funding data, growth signals, open job count, recruiter density, and pain points.

**`POST /api/companies/strategic-value-v3`**

Body: `{ companyName: string; useAI?: boolean }`

Enhanced version with AI-powered assessment, priority scoring, and additional dimensions (hiring velocity, engineering maturity, remote friendliness, product momentum).

### Recruiter Discovery

**`POST /api/recruiters/discover-v2`**

Body: `{ companyName: string; roleTitle?: string }`

AI-powered recruiter contact discovery for a target company. Falls back to heuristic-based discovery.

**`POST /api/recruiters/discover-v3`**

Body: `{ companyName: string; companyUrl?: string; companyDomain?: string; roleTitle?: string }`

Multi-source recruiter discovery with URL/domain-based enrichment.

### Email Discovery

**`POST /api/email/discover`**

Body: `{ companyName?: string; recruiterIds?: string[] }`

Verifies and stores email addresses for recruiters via external verification services.

### Company Assessment Route

**`POST /api/companies/route`**

Body: `{ companyName: string }`

Full pipeline: validates resume exists, runs AI-powered company quality assessment, strategic value scoring, and optional founder detection.

### Skills Gap Analysis

**`POST /api/skills/gap`**

Body: `{ candidateSkills: string[]; jobDescription: string; useAi?: boolean }`

Analyzes skill gaps between a candidate's skill set and a job description. Optionally uses AI for deeper analysis.

### Resume Parsing

**`POST /api/resumes/parse`**

Parses uploaded resume text into structured data (skills, experience, education).

**`POST /api/resumes/analyze`**

AI-powered resume analysis with keyword gap detection, role suitability scoring, and improvement suggestions.

**`POST /api/resumes/tailor`**

Generates a tailored resume version optimized for a specific job description.

**`GET /api/resumes/details`**  
**`GET /api/resumes/center`**  
**`GET /api/resumes/primary`**  
**`DELETE /api/resumes/delete`**

CRUD and metadata operations for user resumes.

### Candidate Brain

**`GET/POST /api/candidate-brain`**

Retrieves or updates the user's full candidate profile (skills, projects, education, experience, certifications, memory entries).

### Company Targeting

**`GET /api/companies/target?companyName=`**  
**`POST/PUT /api/companies/target`**

Read or update company targeting status, quality scores, and strategic value scores.

---

## Phase B — Action Handlers

These endpoints execute actions on behalf of the user.

### Application Submission

**`POST /api/apply`**

Body: `{ jobId: string; companyName: string; roleTitle?: string }`

Full application pipeline: resolve primary resume, create application record, build application package, submit via Playwright (or mark MANUAL_APPLY), schedule follow-up cadence.

**`POST /api/applications/generate-package`**  
**`POST /api/applications/answers`**

Generate application packages (cover letter, tailored resume, answers) and store structured application answers.

### Batch Apply

**`POST /api/batch-apply/run`**

Body: `{ strategy: string; filters?: object; approvalMode?: boolean; execute?: string }`

Runs batch applications across eligible jobs using a strategy (balanced, aggressive, conservative). Supports approval mode: queues items for review before execution.

**`POST /api/batch-apply/eligibility`**

Body: `{ strategy: string; filters?: object }`

Returns eligible jobs for batch apply without executing.

### Outreach

**`POST /api/outreach/v2`**

Body: `{ kind: string; companyName: string; recruiterId?: string; resumeId?: string; painPointIds?: string[] }`

Generates an AI-powered outreach draft (email, LinkedIn DM, or Loom script).

**`POST /api/outreach/send`**  
**`POST /api/outreach/send-pending`**

Sends outreach messages via Gmail SMTP. Uses OAuth2 credentials.

**`POST /api/outreach/generate`**  
**`POST /api/outreach/campaign`**  
**`POST /api/loom/script`**

Legacy outreach generation endpoints (v1).

### Follow-Up Engine

**`POST /api/followups/schedule`**

Body: `{ applicationId?: string; recruiterId?: string; companyName: string }`

Schedules a follow-up cadence for an application or recruiter contact.

**`POST /api/followups/generate`**

Body: `{ followupId: string }`

Generates a contextual follow-up message.

**`GET /api/followups/due`**

Returns all due follow-ups for the current user.

**`POST /api/followups/mark-sent`**

Body: `{ followupId: string }`

Marks a follow-up as sent.

**`GET /api/follow-ups`**  
**`POST /api/follow-ups/auto-create`**

Legacy follow-up listing and auto-creation.

### Inbox Sync

**`POST /api/inbox/sync`**

Body: `{ maxResults?: number }`

Syncs Gmail inbox for the current user. Fetches recent messages, classifies them (interview, assessment, offer, rejection, networking, other).

**`POST /api/inbox/classify`**

Body: `{ subject: string; body: string; fromAddress: string }`

Classifies a single message without syncing.

**`GET /api/inbox/list?classification=`**

Lists synced inbox messages, optionally filtered by classification.

---

## Authentication Middleware

### `requireApiUser(request)`

All protected routes call `requireApiUser` from `api/_lib/auth.ts`:

1. Extracts the `Authorization: Bearer <token>` header.
2. Validates the token against Supabase Auth (`supabaseAdmin.auth.getUser`).
3. Returns `{ id, email }` or throws a `401 Response`.

The client obtains the token from `supabase.auth.getSession()` and attaches it via the `apiGet`/`apiPost` helpers in `src/lib/api-client.ts`.

---

## Browser Automation Endpoints

Powered by Playwright (`api/_lib/playwright-platform.ts`).

| Endpoint | Method | Description |
|---|---|---|
| `/api/browser/profiles` | GET | List all browser profiles for the user |
| `/api/browser/profiles?provider=` | DELETE | Delete a browser profile |
| `/api/browser/session` | POST | Launch an authenticated browser context for a provider |
| `/api/browser/storage-state?provider=` | GET | Get the saved storage state for a provider |
| `/api/browser/capture` | POST | Save captured storage state after manual login |

### Apply Evidence

**`GET /api/applications/evidence?applicationId=`**

Returns Playwright-generated evidence (screenshots, logs) from an automated application submission.

---

## Provider Management

### Provider Controls (`api/_lib/provider-controls.ts`)

Provider status is managed through Telegram bot commands and the `provider_controls` table.

| Bot Command | Action |
|---|---|
| `/provider-status` | List all providers with current status |
| `/provider-enable <name>` | Enable a provider |
| `/provider-disable <name>` | Disable a provider |
| `/provider-pause <name>` | Pause a provider |

Supported providers: `linkedin`, `indeed`, `naukri`, `wellfound`, `instahyre`.

The provider registry in `api/_lib/providers.ts` defines auth methods:

- `public_board` — token-in-url / public feed (Greenhouse, Lever, Ashby, Workable)
- `api_key` — partner API key (Greenhouse Harvest, Workable API)
- `oauth` — user OAuth (Gmail)
- `cookie` — session cookie (LinkedIn, Indeed, Naukri, Wellfound, Instahyre)

### Provider Import

**`POST /api/providers/import`**

Bulk import jobs from any registered provider source.

---

## Webhook Endpoints

### n8n Webhooks

**`GET/POST /api/n8n/events`**

List or emit workflow events. Used by n8n to read events and trigger automations.

**`GET/POST /api/n8n/webhooks`**

List or create webhook subscriptions. Subscriptions include a secret used to sign outgoing webhook payloads with the `x-valtrexa-v2-secret` header.

### Telegram Webhook

**`POST /api/telegram/webhook`**

Receives Telegram Bot API updates. Processes commands (`/provider-status`, `/provider-enable`, `/provider-disable`, `/provider-pause`, `/interviews`, `/stats`) and inline callbacks.

Auto-registered at startup via `initTelegramBot()` when `PUBLIC_URL` is set.

---

## Gmail OAuth

Gmail integration uses server-side OAuth2 with a refresh token. Configured via environment variables:

| Variable | Purpose |
|---|---|
| `GMAIL_CLIENT_ID` | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Stored refresh token for offline access |
| `GMAIL_REDIRECT_URI` | OAuth redirect URI (default: `http://localhost:4173/api/auth/gmail/callback`) |

Used by:

- **Inbox sync** (`api/_lib/inbox-intelligence.ts`) — fetches and classifies emails
- **Outreach sending** (`api/_lib/outreach-sender.ts`) — sends email via Gmail SMTP

The OAuth helper scripts are available in the repository for initial token generation.

---

## Queue & Event Bus

### Queues (BullMQ via `api/_lib/queue.ts`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/queue/enqueue` | POST | Enqueue a job into a named queue |
| `/api/queue/stats` | GET | Get queue statistics for the user |

Queue names: `job-import`, `apply`, `recruiter`, `outreach`, `followup`, `gmail`, `analytics`.

### Event Bus (`api/_lib/event-bus.ts`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/event-bus/consumers` | GET/POST | List or register event consumers |
| `/api/event-bus/replay` | POST | Replay a workflow event to all consumers |
| `/api/event-bus/history` | GET | Get delivery history for an event |

Consumer types: `webhook`, `telegram`, `n8n`, `worker`.

---

## Health & Admin

**`GET /api/health`**

Returns service status, database connectivity, Redis connectivity, and version.

**`POST /api/admin/migrate`**

Triggers database auto-migration.

---

## Approval Workflow

**`GET /api/approvals/status?status=pending`**

Lists applications awaiting approval. Used by the approval-mode batch apply flow.

---

## Analytics

**`GET /api/analytics/summary`**  
**`GET /api/analytics/daily-summary`**

Returns aggregate analytics and daily summary data for the current user.
