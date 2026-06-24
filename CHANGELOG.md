# Changelog

All notable changes to the **VALTREXA-V2** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-06-24

### Initial Release

#### Features

- **Resume-Driven Candidate Profile** — Upload, parse, analyze, and tailor resumes. AI-powered skill extraction, keyword gap analysis, and role suitability scoring. Resume version history with primary resume selection.
- **Job Import Engine** — Multi-provider job import from Greenhouse, Lever, Ashby, Workable, LinkedIn, Indeed, Naukri, Wellfound, and Instahyre. Deduplication and upsert by `user_id + source + external_id`.
- **Match Scoring** — Algorithmic resume-to-job matching with skill overlap, experience alignment, location fit, salary compatibility, and freshness weighting.
- **High-Value Target Assessment** — Strategic value scoring for target companies using hiring signals, funding data, growth signals, open job count, recruiter density, tech stack analysis, and AI-powered assessment (v3).
- **Recruiter Discovery** — AI-powered recruiter contact discovery (v2) and multi-source enrichment (v3). Email verification and confidence scoring.
- **Automated Application Pipeline** — End-to-end application submission via Playwright browser automation. Supports application package generation (cover letter, tailored resume), manual apply fallback, and approval workflow.
- **Batch Apply** — Apply to multiple jobs in a single operation with configurable strategies (balanced, aggressive, conservative). Approval mode for manual review before execution.
- **Outreach Engine** — AI-generated outreach drafts for email, LinkedIn DM, and Loom video scripts. Gmail SMTP sending via OAuth2.
- **Follow-Up Engine** — Automated follow-up cadence scheduling and generation for applications and recruiter contacts. Due follow-up listing and sent tracking.
- **Gmail Inbox Intelligence** — OAuth2 Gmail inbox sync with automatic message classification (interview, assessment, offer, rejection, networking, other).
- **Browser Profile Management** — Playwright-based authenticated session management with storage state capture, listing, and deletion per provider.
- **Provider Control System** — Enable, disable, and pause provider integrations with automatic failure detection and self-disabling after 3 consecutive failures. Health event logging.
- **Telegram Bot** — Real-time notifications and provider management via Telegram. Commands for provider status, enable/disable/pause, interview tracking, and stats.
- **Event Bus & Webhooks** — Workflow event system with n8n-compatible webhook subscriptions. HMAC-signed webhook deliveries (`x-valtrexa-v2-secret` header).
- **Job Queue System** — BullMQ-based background job processing for imports, applications, recruiter discovery, outreach, follow-ups, Gmail sync, and analytics.
- **Analytics Dashboard** — Summary and daily analytics with key metrics, trends, and activity tracking.
- **Company CRM** — Target company tracking with quality scoring, strategic value assessment, and founder detection.
- **Interview Preparation** — Interview prep workspace with company research, question tracking, and preparation materials.
- **Settings & Configuration** — User settings, integration configuration, and provider credential management UI.
- **Supabase Auth** — Email/password and Google OAuth authentication with Row Level Security for multi-tenant data isolation.
- **Rate Limiting** — Per-IP rate limiting with configurable window and max requests.
- **Sentry Error Tracking** — Server-side error reporting with health endpoint exclusion.

#### Architecture

- **TanStack Start** server framework with Vite build tooling.
- **File-based API routing** via `api/[...route].ts` catch-all handler.
- **Phase A (Data) / Phase B (Action)** handler separation in `api/phase-handlers.ts`.
- **Shared library pattern** in `api/_lib/` for all backend modules.
- **TypeScript strict mode** with ESLint and Prettier.
- **Vitest** for unit testing.
- **Vercel SSR** output via build-time preparation script.
- **PostgreSQL** database with auto-migration support.
- **Redis** for BullMQ queue backend.
- **Zustand + React Query** for state management.
- **Radix UI + Tailwind CSS v4** for component library.
