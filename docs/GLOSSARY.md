<p align="center">
<picture>

<source media="(prefers-color-scheme: dark)" srcset="docs/assets/favicon.svg">

<img src="assets/favicon.svg" alt="Valtrexa V2" width="64" height="64">

</picture>
</p>

<h1 align="center">📄 Glossary</h1><p align="center">  <strong>Version:</strong> v1.0.1 •  <strong>Last Updated:</strong> 2026-07-05 •  <strong>Category:</strong> Reference</p>
**Description:**  Comprehensive terminology reference for all technical terms, concepts, and abbreviations used across the VALTREXA-V2 platform.

---

## Table of Contents
- [Overview](#overview)
- [A](#a) · [B](#b) · [C](#c) · [D](#d) · [E](#e) · [F](#f) · [G](#g) · [H](#h) · [I](#i) · [J](#j) · [K](#k) · [L](#l) · [M](#m) · [N](#n) · [O](#o) · [P](#p) · [Q](#q) · [R](#r) · [S](#s) · [T](#t) · [U](#u) · [V](#v) · [W](#w) · [Z](#z)
- [Best Practices](#best-practices)
- [Related Documents](#related-documents)

---

## Overview
> [!NOTE]
> This glossary covers all domain-specific terms, acronyms, and concepts used throughout VALTREXA-V2. Terms are alphabetically organized for quick reference.
> [!TIP]
> Terms marked with see-also references link to related concepts. Use the Related

Documents section for deeper dives into specific subsystems.

## Term-Category Relationship DiagramThe following diagram illustrates how key terms relate across the major subsystems of VALTREXA-V2:
```
mermaidgraph TD    subgraph "Data Layer"        DB[(Database<br/>
70 tables, 28 migrations)]        RLS[Row Level Security<br/>
user_id = auth.uid()]        ENC[AES-256-GCM<br/>
Cookie Encryption]    end    subgraph "Automation Layer"        PW[Playwright Chromium<br/>
Browser Automation]        SH[Self-Healing Selectors<br/>
10 fallback methods]        CAP[CAPTCHA Detection]        EVI[Apply Evidence<br/>
Screenshots & HTML]    end    subgraph "Queue Layer"        BQ[BullMQ<br/>
7 Queue Types]        RF[Redis<br/>
Queue Backend]        IL[Inline Fallback<br/>
Graceful Degradation]    end    subgraph "AI Layer"        AFC[AI Fallback Chain<br/>
Gemini → Groq → OpenRouter]        ME[Match Engine<br/>
8-Factor Scoring]        CG[Content Generation<br/>
Outreach, Resumes]        II[Inbox Intelligence<br/>
Email Classification]    end    subgraph "Workflow Layer"        SM[State Machine<br/>
idle/running/paused/stopped]        P8[8 Workflow Phases]        DL[Distributed Lock<br/>
SET NX EX]        WP[Workflow Precheck]    end    subgraph "Provider Layer"        PR[9 Job Providers<br/>
LinkedIn, Indeed, ...]        PC[Provider Controls<br/>
enabled/paused/disabled]        PH[Provider Health Log]        FC[Failure Detection]    end    subgraph "Security Layer"        DID[Defense-in-Depth<br/>
6 Layers]        SR[Service Role<br/>
145+ Audited Writes]        TB[

Telegram Bindings]        CSRF[CSRF Protection]    end    DB --> RLS    DB --> ENC    PW --> SH    PW --> CAP    PW --> EVI    BQ --> RF    BQ --> IL    ME --> AFC    ME --> CG    ME --> II    SM --> P8    SM --> DL    SM --> WP    PR --> PC    PR --> PH    PR --> FC    DID --> SR    DID --> TB    DID --> CSRF    RLS --> SR    P8 --> ME    P8 --> PW    P8 --> BQ    PC --> PH
```

---

## A

## Activity LogsDatabase table (`activity_logs`) that records general user activity for audit trail purposes.
Every significant operation is logged with timestamp, user context, and action details.

Used for debugging and compliance.

## Admin DashboardMulti-tab administrative interface for user inspection, provider controls, queue monitoring, and workflow state management. Accessible to users with the `admin` role. See [

Admin Guide](ADMIN.md).

## AES-256-GCM EncryptionAuthenticated encryption algorithm used to encrypt provider session cookies at rest. Uses a 256-bit key derived via SHA-256 of the `COOKIE_ENCRYPTION_KEY`, a random 16-byte IV per encryption, and produces a 16-byte authentication tag for integrity verification. Storage format: `hex(iv):hex(authTag):hex(ciphertext)`.

See [Security](SECURITY.md).

## AI Fallback ChainThe ordered sequence of AI providers attempted for each AI operation: Gemini (primary) → Groq (first fallback) → OpenRouter (secondary fallback). If a provider fails, the next in the chain is tried.

If all fail, an `AggregateError` is thrown.

## AI Provider AbstractionUnified interface (`AiProvider`) implemented by all AI backends (`GeminiProvider`, `GroqProvider`, `OpenRouterProvider`). Provides `generateText()`, `generateJson()`, `healthCheck()`, `getMetrics()`, and `resetMetrics()` methods.

Enables provider swapping without changing consumer code.

## Analytics PhaseEighth and final phase of the workflow cycle. Computes summary and daily analytics metrics: application counts, interview detection, offer tracking, daily summaries, and trend data.

Cached in the `analytics` table.

## Application StatusEnum type defining the lifecycle of a job application: `saved`, `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn`, `accepted`.

Stored in `applications.status`.

## Apply EvidenceScreenshots and HTML snapshots captured during Playwright-based application submission.

Stored in `apply_evidence` table for audit and debugging purposes.

## Apply PipelineFifth phase of the workflow cycle. Creates application records for matched jobs, then submits pending applications via

Playwright browser automation following the configured batch strategy.

## Approval ModeOperational mode where applications or outreach messages require user approval via Telegram before submission. Controlled by `ENABLE_TELEGRAM_APPROVALS` env var. Conservative and Balanced strategies default to approval required;

Aggressive defaults to approval disabled. Actions: Approve, Edit, Skip, Always, Never.

## Approval RequestsDatabase table (`approval_requests`) tracking pending approvals for applications and outreach drafts. Users approve, edit, or skip via

Telegram inline keyboard or web dashboard.

## AshbyATS (Applicant Tracking System) platform supported as a public board job source. No authentication required.

Job discovery only — no automated apply supported.

## Auto-DisableProvider lifecycle mechanism: after 3 consecutive validation failures, a provider is automatically transitioned from `paused` to `disabled`.

User must manually re-enable after re-authenticating.

## Auto-ResumeDuring the `health_check` phase, providers in `paused` state with newly valid cookies are automatically re-enabled.

Users do not need to manually resume.

## Auto-RetryGeneric retry mechanism with exponential backoff (default: 3 attempts, 2s base).

Applied to transient failures, timeouts, and rate-limited operations across the automation layer.

---

## B

## B1 (Playwright Platform)Phase B handler label for browser profile and session management operations.

Handles authenticated context launch, browser profile management, and session persistence.

## B2/B3 (Queue Operations)

Phase B handler labels for BullMQ queue management and monitoring. B2 handles queue enqueue operations; B3 handles queue statistics and status queries.

## B4 (Event Bus)Phase B handler label for webhook/event delivery system operations.

Handles event consumer registration and event replay.

## Batch ApplyMechanism to submit applications to multiple jobs in a single operation run.

Supports three strategies (Conservative, Balanced, Aggressive) with configurable filters (minScore, tier, source, workMode, freshness, easyApplyOnly, companySize).

## Batch Apply Strategies
- **Conservative** — Tier A only, easy-apply required, 24h/3d freshness, approval required, 85% min score
- **Balanced** — Tiers A/B, easy-apply preferred, 24h/3d/7d freshness, approval required, 70% min score
- **Aggressive** —

Tiers A/B/C, any apply type, 24h/3d/7d/30d freshness, approval disabled, 50% min score

## Browser SessionPersistent Playwright browser session record stored in `browser_sessions` table.

Maintains authenticated context between workflow cycles to avoid repeated login.

## BullMQRedis-backed job queue library for Node.js. VALTREXA-V2 uses 7 queue types: `job-import`, `apply`, `recruiter`, `outreach`, `followup`, `gmail`, `analytics`. Degrades gracefully with inline fallback when

Redis is unreachable.

---

## C

## Candidate BrainDynamic profile memory system — the single source of truth for all candidate data. Stores skills, experience, education, projects, certifications, preferences, and goals.

Consumed by match engine, outreach generator, resume tailor, and all other AI modules.

## Candidate MemoryAI memory store (`candidate_memory` table) for form auto-fill and personalization.

Learns user preferences and patterns over time to improve automation accuracy.

## CAPTCHA DetectionPlaywright automation detects CAPTCHA challenges on provider pages by analyzing page content and URL patterns. Detected CAPTCH

As are marked as unresolvable and require manual user intervention.

## Certification TrackingDatabase records (`certifications` table) for professional certifications.

Used in candidate brain for match scoring and skill gap analysis.

## Company Quality ScoreWeight factor (0.05) in match scoring algorithm.

Evaluates company reputation, industry rank, size, and culture data to determine overall company quality.

## Company ResearchAI-generated company intelligence stored in `company_research` table.

Produced during the high-value pipeline phase and used for outreach personalization.

## Cookie-Based AuthenticationSession-based authentication method for job providers. Users manually extract session cookies from their browser after logging in and paste them into VALTREXA-V2. Cookies are encrypted at rest with AES-256-GCM and used at runtime by

Playwright automation.

## Cookie Encryption KeyEnvironment variable (`COOKIE_ENCRYPTION_KEY`) used for AES-256-GCM key derivation. If not set, defaults to SHA-256 of an empty string — a known constant. Always set a strong random value in production.
> [!WARNING]
> The default `COOKIE_ENCRYPTION_KEY` (empty string) is a known constant.

Always set a strong random value in production environments.

## Cookie Status

Status values for provider cookies: `valid` (authenticated and usable), `expired` (session timed out), `captcha_required` (CAPTCHA challenge), `invalid` (malformed or rejected), `pending` (awaiting validation), `missing` (not configured).

## CSRF ProtectionCross-Site Request Forgery protection for Google OAuth flow using a random state parameter (`crypto.randomUUID()`).

Stored in `sessionStorage`, verified on callback.

## Cycle (Workflow)One complete execution of all 8 sequential workflow phases. Default cycle interval: 30 minutes.

Configurable via `jobImportIntervalMinutes`.

---

## D

## Daily SummariesAggregated daily activity digest stored in `daily_summaries` table.

Generated by the analytics phase and includes application counts, interview statistics, and key metrics.

## Data FlowSequence of operations from user input (resume upload, cookie configuration) through AI processing, database storage, Playwright automation, and notification delivery.

See [Architecture](ARCHITECTURE.md#data-flow).

## Defense-in-DepthSix-layer security architecture: Authentication (Layer 1), Authorization/RLS (Layer 2), Encryption (Layer 3), Rate Limiting (Layer 4), Input Validation (Layer 5), Monitoring (Layer 6).

Each layer is independently hardened.

## Deployment ModelDual deployment architecture:
- **Vercel** — Frontend (TanStack Start), SSR, API routes (serverless functions)
- **Railway (optional)** —

Background worker for Playwright, BullMQ processing

## Discover Recruiters PhaseThird phase of the workflow cycle.

Discovers recruiter contacts for matched jobs without existing recruiter data using AI-powered multi-strategy discovery.

## Distributed LockRedis-based lock (`SET NX EX`) used by the

Railway worker to prevent duplicate workflow execution across multiple replicas.

## Dual Deployment ModelSee [

Deployment Model](#deployment-model).

## Dynamic

Profile MemoryAI-powered memory module (`dynamic-profile-memory.ts`) that learns form-fill patterns and user preferences to improve automation accuracy over time.

---

## E

## Easy ApplyJob applications that can be submitted with minimal effort (no lengthy forms). Supported by certain providers and prioritized by Conservative and

Balanced batch strategies.

## Email DiscoveryPhase A handler (P4) for email verification and enrichment of recruiter contact information.

Used to validate discovered email addresses before outreach.

## Enum Types

Nine PostgreSQL enum types for domain-safe status fields: `app_role`, `skill_level`, `remote_pref`, `employment_type`, `application_status`, `job_status`, `job_priority`, `interview_status`, `outreach_status`.

## Event BusPersisted workflow event delivery system (`event-bus.ts`). Manages webhook subscriptions, event emission, delivery tracking, and event replay.

Supports n8n webhook integration.

## Experience WeightMatch scoring factor (0.16) evaluating years of experience alignment between candidate and job requirements.

Uses level-based range matching.

---

## F

## Failure DetectionModule (`failure-detection.ts`) for provider-specific failure pattern detection.

Identifies cookie expiry, CAPTCHA challenges, anti-bot pages, rate limiting, and provider downtime.

## Follow-up Cadence3-interval follow-up scheduling system: Day 3, Day 7, and

Day 14 after initial outreach. Context-aware follow-ups reference previous conversation history.

## Followups PhaseSixth phase of the workflow cycle. Processes due follow-ups using the 3-cadence system. Sends context-aware follow-up emails via

Gmail API.

## Freshness WeightMatch scoring factor (0.07) evaluating job posting recency.

Uses a decay curve where newer posts score progressively higher.

## Fuzzy MatchingText-based element location strategy (`findElementFuzzy`) in the self-healing system.

Uses word scoring for loosely-defined labels when exact text and CSS selectors fail.

---

## G

## GeminiPrimary AI provider (Google Gemini 2.5 Pro). Used for complex reasoning, multimodal tasks, and high-accuracy structured JSON generation.

First in the AI fallback chain.

## Gmail APISingle-mailbox Gmail OAuth integration for:- Inbox sync and message classification (interview, assessment, offer, rejection)-

Outreach message sending with tracking- Follow-up email delivery

## Gmail WorkerBullMQ worker (`workers/gmail-worker.ts`) for Gmail inbox sync and message classification.

Processes the `gmail` queue.

## GreenhouseATS platform supported as a public board job source. No authentication required.

Job discovery only — no automated apply.

## GroqFirst fallback AI provider (Llama 3 8B via Groq API). Used for high-speed inference and cost-effective throughput.

Second in the AI fallback chain.

---

## H

## Health Check PhaseSeventh phase of the workflow cycle. Validates provider cookies and health status. Auto-resumes paused providers with renewed valid cookies.

Updates `last_health_check_at` timestamps.

## High-Value Engine (V3)Strategic value scoring system for target companies. Assesses hiring signals, funding data, market position, tech stack relevance, and recruiter density. Used in

Pipeline B.

## High-Value Pipeline PhaseFourth phase of the workflow cycle.

Identifies high-value companies from matched jobs, discovers recruiters, generates outreach drafts, and checks pending approvals. Multi-step: B1 → B2 → B3 → B4.

---

## I

## Import Jobs PhaseFirst phase of the workflow cycle. Imports new job listings from all enabled providers via

Playwright automation with per-provider error isolation.

## Inbox IntelligenceGmail inbox classification system (`inbox-intelligence.ts`).

Categorizes incoming messages: `interview`, `assessment`, `offer`, `rejection`, `recruiter_reply`, `other`.

## Inline FallbackGraceful degradation mechanism in BullMQ queue system.
When Redis is unreachable, jobs execute in-process (inline) instead of queuing.

Ensures API functionality in serverless deployments without Redis.

## InstahyreCookie-authenticated job board provider. Requires `sessionid` and `csrftoken` cookies.

Supports automated job discovery, application, and recruiter discovery.

## Interview StatusEnum type for interview lifecycle: `scheduled`, `completed`, `cancelled`, `rescheduled`.

Stored in `interviews.status`.

---

## J

## Job Import Runs

Database table (`job_import_runs`) tracking each import cycle: source provider, job count, status, and timestamps.

## Job MatchesDatabase records (`job_matches`) storing explicit job match results with per-factor score breakdowns.

Generated during the match scoring phase.

## Job PreferencesUser-configurable job search criteria (`job_preferences` table): desired roles, locations, salary range, remote preference, company size, and industry focus.

## Job StatusEnum type for job listing lifecycle: `open`, `closed`, `saved`, `archived`.

Stored in `jobs.status`.

---

## L

## Learning LoopFeedback-driven skill improvement tracking system (`learning_loop` table). Records user skill development, learning goals, and progress.

Informs resume updates and skill gap analysis.

## LeverATS platform supported as a public board job source. No authentication required.

Job discovery only — no automated apply.

## LinkedInSocial/job board platform. Primary cookie-authenticated provider. Requires `li_at` cookie.

Full support: job discovery, auto-apply, and recruiter discovery.

## Location Weight

Match scoring factor (0.10) evaluating remote/hybrid/onsite compatibility between candidate preferences and job location using a compatibility matrix.

## Loom ScriptAI-generated Loom video recording scripts for high-value outreach targets. Stored in `loom_scripts` table.

Created during the high-value pipeline phase to enable personalized video outreach.

---

## M

## Match Engine8-factor weighted matching algorithm (`match-engine.ts`) scoring the alignment between imported jobs and the candidate brain profile. Factors: Skills (0.32), Role (0.20), Experience (0.16), Location (0.10), Salary (0.07), Freshness (0.07), Company Quality (0.05),

Recruiter (0.03).

## Match Scoring ThresholdConfigurable minimum score for job applications (default: 70%). Jobs below threshold are marked as unmatched.

Jobs above threshold are assigned tiers: A (≥85), B (70–84), C (50–69), D (<50).

## Migrations (Database)28 timestamped SQL migration files in `supabase/migrations/` applied incrementally.
Each migration is idempotent, production-safe, and documented. See [

Database Schema](DATABASE.md).

## Multi-User IsolationArchitecture pattern where all user data is scoped by `user_id`:- All tables enforce RLS: `user_id = auth.uid()`- Service role queries include `.eq("user_id", userId)` on every operation- Telegram bindings per-user via `telegram_bindings` table-

Provider cookies, controls, and health data are per-user

---

## N

## n8n Webhook SubscriptionWebhook subscription management stored in `n8n_webhook_subscriptions` table.

Enables integration with n8n workflow automation for custom triggers and event-based actions.

## NaukriCookie-authenticated Indian job board provider. Requires `nauk_sid` cookie.

Supports job discovery and automated apply.

## Notification CenterIn-app notification system (`notification-center.ts`) with filter tabs, severity icons, and category badges.

Notifications are stored in the `notifications` table with per-user RLS.

## Notification QueueDatabase table (`notification_queue`) for queued notification records.

Used alongside the in-app notification center to ensure reliable delivery of alerts and updates.

---

## O

## Onboarding Wizard9-step guided setup wizard: resume upload, candidate brain review, role/location preferences, provider configuration, and

Telegram binding. First-run experience for new users.

## OpenRouterSecondary fallback AI provider aggregating multiple model providers through a single API. Default model: `openai/gpt-4o-mini`.

Also supplies a free model chain for cost-sensitive operations.

## OpenRouter Free Model Chain

Three free-tier models tried in sequence: `google/gemma-4-26b-a4b-it:free`, `qwen/qwen3-next-80b-a3b-instruct:free`, `nvidia/nemotron-nano-9b-v2:free`.

## Outreach CampaignCampaign-level orchestration of outreach to multiple recruiters.

Managed in `outreach_campaigns` table with per-user RLS.

## Outreach DraftsAI-generated personalized outreach messages pending user approval. Stored in `outreach_drafts` table. Approved drafts are sent via the

Gmail API.

## Outreach MessagesSent outreach messages with delivery tracking. Stored in `outreach_messages` table.

Status tracked via `outreach_status` enum: `draft`, `sent`, `replied`, `no_response`, `bounced`.

## Outreach OrchestrationEnd-to-end pipeline for AI-generated personalized outreach: recruiter discovery → draft generation → approval flow → message sending → follow-up cadence.

## Outreach StatusEnum type for message delivery: `draft`, `sent`, `replied`, `no_response`, `bounced`.

Used across outreach-related tables.

---

## P

## P3 (Recruiter Discovery V3)Phase A handler label for the third-generation AI-powered recruiter contact discovery system. Multi-strategy approach using Lusha, SignalHire, API lookups, and

Google search.

## P4 (Email Discovery)Phase A handler label for email verification and discovery pipeline.

Validates and enriches recruiter email addresses before outreach.

## P5 (High Value Engine V3)

Phase A handler label for strategic value assessment of target companies. AI-augmented analysis of hiring signals, funding, and growth indicators.

## P8 (Approval Status)Phase A handler label for approval workflow queries.

Returns pending approval status for generated outreach content and applications.

## Phase A (Data-Centric Handlers)API handler pattern for data-oriented operations: analyze, score, discover, and prepare.

Includes handlers P3, P4, P5, and P8.

## Phase B (Action-Centric Handlers)API handler pattern for action-oriented operations: apply, submit, send, and execute.

Includes handlers B1, B2, B3, and B4.

## Phase Error IsolationDesign pattern where each workflow phase runs in an independent try-catch block.
A failure in one phase does not halt subsequent phases.

Errors are logged and phase results stored in `workflow_log`.

## Pipeline A (Auto-Apply)Automated application pipeline for all matched jobs. Uses Playwright browser automation with cookie-based authentication to submit applications.

Supports three batch strategies and approval mode.

## Pipeline B (High-Value Outreach)Strategic outreach pipeline for high-value opportunities. Combines company research, recruiter discovery, personalized outreach draft generation, approval flow, and follow-up cadence (

Day 3/7/14).

## Playwright AutomationBrowser automation layer using Playwright (Chromium) for job import and application submission.

Features self-healing selectors, cookie-based authentication, approval mode, and evidence capture.

## Playwright PlatformPhase B handler (B1) for browser profile and session management. Manages persistent

Edge profiles and authenticated browser contexts.

## ProviderA job source integration (LinkedIn, Indeed, Naukri, Wellfound, Instahyre, Greenhouse, Lever, Ashby, Workable).

Each provider has a defined auth method, capabilities, and failure registry.

## Provider ChallengesDatabase table (`provider_challenges`) for tracking per-provider obstacles and errors.

Used for health monitoring and troubleshooting.

## Provider ControlsPer-provider lifecycle management: `enabled` → `paused` (validation failure) → `disabled` (3 consecutive failures). Managed via web dashboard,

Telegram (`/provider_enable`, `/provider_disable`), and API.

## Provider Health Log

Database table (`provider_health_log`) with `user_id` column recording health events per provider: status changes, error messages, and validation timestamps.

## Provider Registry

Central provider registry (`providers.ts`) defining 9 providers with authentication methods, capabilities, and configuration.

## Provider Status Values- `enabled` — Provider active and operational- `paused` — Temporarily suspended (validation failure)- `disabled` —

Permanently disabled (3 consecutive failures)

---

## Q

## Queue JobsDatabase table (`queue_jobs`) serving as a DB mirror of BullMQ job audit trail.

Provides persistent record of all queued operations.

## Queue Types (BullMQ)Seven queue types used for background processing:1. `job-import` — Job import from providers2. `apply` — Application submission3. `recruiter` — Recruiter discovery4. `outreach` — Outreach generation5. `followup` — Follow-up processing6. `gmail` — Gmail sync/classification7. `analytics` —

Analytics computation

---

## R

## Rate LimitingIn-memory rate limiting: Global (100 requests per 60s per IP) and Telegram per-chat (10 requests per 3s).

Returns HTTP 429 with `retry-after` header on exceed.

## Recruiter DiscoveryMulti-strategy contact discovery system for finding recruiter contact information. Strategies include Lusha, SignalHire, API-based lookups, and

Google search.

## Recruiter Weight

Match scoring factor (0.03) providing a bonus for jobs where a recruiter connection or engagement signal already exists.

## RedisIn-memory data store used as BullMQ queue backend. VALTREXA-V2 connects via `REDIS_URL` (Upstash or Railway Redis).

Falls back to inline execution when unavailable.

## Resume ParsingAI-powered extraction of structured data from uploaded resumes (PDF, DOCX).

Extracts skills, experience duration, education history, and project highlights.

## RLS (Row Level Security)PostgreSQL Row Level Security enforced on every user-scoped table. Policy pattern: `user_id = auth.uid()`.

Service role bypasses RLS but enforces user scoping in code. 28 migrations implement RLS across 34+ core tables.

## Role Weight

Match scoring factor (0.20) evaluating title similarity and seniority alignment between candidate preferences and job listing.

---

## S

## Salary WeightMatch scoring factor (0.07) evaluating salary range overlap between candidate expectations and job posting.

Uses percentage-based range overlap calculation.

## Self-Healing SelectorsResilient

Playwright automation system (`self-healing.ts`) with 10 fallback methods: `findElementWithFallback`, `findElementByText`, `findElementByAriaLabel`, `findElementFuzzy`, `retryOperation`, `retryNavigation`, `retryUpload`, `retryClick`, `smartSelectorHeal`, `autoHeal`.

## Self-Healing Fallback HierarchyPrimary CSS selector → Fallback selector chain (2-3 alternatives) → Text match → Fuzzy text match → ARIA label match →

Retry with exponential backoff.

## SentryError monitoring and performance tracking integrated on both frontend (React) and backend (Node).

Configured via `SENTRY_DSN`.

## Service RoleSupabase service role (`supabaseAdmin` client) used exclusively server-side.

Bypasses RLS; all queries must manually scope via `.eq("user_id", userId)`. 145+ write operations audited — zero unscoped writes.

## Session ManagementJWT-based session management via Supabase Auth. Tokens validated by `requireApiUser()` middleware on every API request.

Email gate enforced for email-only users.

## Skill Gap AnalysisModule (`skill-gap.ts`) comparing candidate skills against target role requirements.

Identifies missing skills and generates learning recommendations.

## Skills WeightHighest-weighted match scoring factor (0.32).

Evaluates semantic overlap between job requirements and candidate skills via AI embedding comparison.

## SSR (Server-Side Rendering)Nitro-based SSR engine (Vite 7) powering Tan

Stack Start. File-based routing with server-side rendering and client-side hydration.

## State

Machine (Workflow)Four-state workflow lifecycle: `idle` → `running` → `paused` / `stopped`. Auto-restart on cycle completion. Auto-stop for workflows stale >2 hours.

## Structured LoggingPino-based logging with configurable log level (`LOG_LEVEL`).

Provides structured JSON output for production log aggregation.

## Supabase AuthAuthentication provider supporting email/password (bcrypt, email confirmation) and Google O

Auth (state-parameter CSRF protection).

---

## T

## Tailored ResumesJob-specific tailored resume versions generated by AI.

Stored in `tailored_resumes` table linked to specific resumes and job targets.

## Telegram BindingsMulti-user binding system mapping Telegram chat IDs to user IDs. Resolved via `telegram_bindings` table.
Each user must bind via `/connect` command.

Replaced legacy `TELEGRAM_USER_ID` env var in v1.0.1.

## Telegram Bot

Full operations interface with 32 commands. Features: provider management, workflow control, interactive approvals (inline keyboard), real-time notifications, and analytics.

## Tier BucketsScore-derived job classification:
- **A** (≥85) — Apply in all strategies
- **B** (70–84) — Apply in Balanced + Aggressive
- **C** (50–69) — Apply in Aggressive only
- **D** (<50) —

Skip (not applied)

## Title NormalizationModule (`title-normalization.ts`) for consistent job title matching. Normalizes variations (e.g., "Software Engineer II" vs. "Software

Engineer 2") for accurate role matching.

---

## U

## User RolesRole assignment system (`user_roles` table) with enum type `app_role` (`admin`, `user`). Admin users gain access to the Admin

Dashboard and elevated management capabilities.

---

## W

## Webhook SecurityTelegram webhook authenticated via `x-telegram-bot-api-secret-token` header compared against `TELEGRAM_WEBHOOK_SECRET`.

All webhooks rate-limited globally and per-chat.

## Wellfound (AngelList)Startup job board. Cookie-authenticated provider requiring `_wellfound_session` cookie.

Supports job discovery and automated apply.

## WorkableATS platform supported as a public board job source. Dedicated importer (`workable-source.ts`).

No automated apply support.

## Workflow ConfigurationConfigurable settings in `workflow-config.ts`: cycle interval, batch size, rate limits, provider defaults.

Customizable per deployment.

## Workflow EventsAudit log of workflow lifecycle events with delivery tracking. Stored in `workflow_events` table.

Supports n8n webhook integration and event replay.

## Workflow PrecheckPre-execution validation module (`workflow-precheck.ts`) checking cookie validity, provider health, and candidate brain completeness before starting a workflow cycle.

## Workflow State Machine

Persistent state tracking across four states: `idle` (awaiting start), `running` (actively processing), `paused` (paused mid-cycle), `stopped` (ended — completion, error, or user stop).

## Workflow TimelineStage tracking system (`workflow-timeline.ts`) with progress bars, duration counters, and timestamps.

Provides real-time visibility into workflow execution status.

---

## Z

## Zod ValidationSchema validation library used for API request payload parsing (`readJson<T>()` with Zod schemas).

Ensures type-safe, validated data at the API boundary.

---

## Best Practices
- **Refer to the Glossary when reading technical docs**: Keep this glossary open when reading architecture, backend, or database documentation for quick term lookups.
- **Understand the relationship between terms**: Use the term-category flow diagram above to see how terms from different subsystems (Data Layer, AI Layer, Workflow Layer) interconnect.
- **Note the weighted factors for match scoring**: The 8-factor match engine uses Skills (0.32) as the highest weight — prioritize resume skill optimization for better match scores.
- **Learn the batch strategies**: Conservative (Tier A, 85%), Balanced (Tiers A/B, 70%), and Aggressive (Tiers A/B/C, 50%) — choose based on your risk tolerance for automated applications.
- **Recognize the provider lifecycle**: Providers move through `enabled` → `paused` (validation failure) → `disabled` (3 consecutive failures).

Know this cycle to manage provider health effectively.

---

## Related Documents
- [Architecture](ARCHITECTURE.md) — System design and data flow
- [Backend Architecture](BACKEND.md) — 59+ engine modules reference
- [Database Schema](DATABASE.md) — Table definitions and relationships
- [Workflow Guide](WORKFLOW.md) — Pipeline orchestration and state machine
- [Provider Guide](PROVIDER_GUIDE.md) — Provider integration details
- [Security](SECURITY.md) — Encryption, RLS, and security architecture
- [Admin Guide](ADMIN.md) — Admin dashboard and system management
- [FAQ](FAQ.md) — Frequently asked questions

---

<br/>
<div align="center">
  <strong>Next Reading:</strong> <a href="ADMIN.md">Admin Guide →</a>
</div>
