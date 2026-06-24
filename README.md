<div align="center">

# VALTREXA-V2

**AI-native software engineering career operating system**

<br>

[![Build](https://img.shields.io/badge/build-passing-22c55e?style=flat-square)](https://github.com/chauhandigvijay1/Valtrexa-V2/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack%20Start-FF4154?style=flat-square&logo=react&logoColor=white)](https://tanstack.com/start)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

<br>

<a href="https://valtrexa-v2.vercel.app/" target="_blank">**Live Demo**</a>
<span>&nbsp;&nbsp;·&nbsp;&nbsp;</span>
<a href="https://github.com/chauhandigvijay1/Valtrexa-V2" target="_blank">**GitHub**</a>

</div>

---

## Overview

VALTREXA-V2 automates the end-to-end software engineering job search — from resume parsing and job discovery through automated applications and outreach orchestration. It replaces spreadsheets, manual tracking, and repetitive browser work with an integrated workspace.

The system integrates with **eight job sources**, uses **multi-provider AI** for matching and discovery, runs **Playwright-based browser automation** for applications, and surfaces everything through a **dashboard** and **Telegram bot**.

---

## Screenshots

<div align="center">
  <table>
    <tr>
      <td><img src="docs/screenshots/dashboard.png" alt="Dashboard" width="400"></td>
      <td><img src="docs/screenshots/applications.png" alt="Applications" width="400"></td>
    </tr>
    <tr>
      <td align="center"><em>Dashboard</em></td>
      <td align="center"><em>Application Pipeline</em></td>
    </tr>
    <tr>
      <td><img src="docs/screenshots/analytics.png" alt="Analytics" width="400"></td>
      <td><img src="docs/screenshots/provider-controls.png" alt="Provider Controls" width="400"></td>
    </tr>
    <tr>
      <td align="center"><em>Analytics & Insights</em></td>
      <td align="center"><em>Provider Controls</em></td>
    </tr>
    <tr>
      <td><img src="docs/screenshots/telegram.png" alt="Telegram Bot" width="400"></td>
      <td><img src="docs/screenshots/resume-upload.png" alt="Resume Upload" width="400"></td>
    </tr>
    <tr>
      <td align="center"><em>Telegram Bot</em></td>
      <td align="center"><em>Resume Upload</em></td>
    </tr>
    <tr>
      <td><img src="docs/screenshots/recruiter-discovery.png" alt="Recruiter Discovery" width="400"></td>
      <td><img src="docs/screenshots/opportunity-radar.png" alt="Opportunity Radar" width="400"></td>
    </tr>
    <tr>
      <td align="center"><em>Recruiter Discovery</em></td>
      <td align="center"><em>Opportunity Radar</em></td>
    </tr>
    <tr>
      <td><img src="docs/screenshots/outreach.png" alt="Outreach" width="400"></td>
      <td><img src="docs/screenshots/settings.png" alt="Settings" width="400"></td>
    </tr>
    <tr>
      <td align="center"><em>Outreach Orchestration</em></td>
      <td align="center"><em>Settings</em></td>
    </tr>
  </table>
</div>

---

## Features

### Resume Intelligence
Parse, store, and version resumes. Extract skills, experience, career goals, and role preferences. Side-by-side comparison across versions. Auto-detect gaps and recommend improvements.

### Application Automation
Browser-automated submissions via Playwright with real browser profiles. Self-healing selectors adapt to UI changes. Approval mode for manual review before submission. Batch processing with configurable daily limits and random delays to avoid detection.

### Recruiter Discovery
Multi-strategy contact discovery — Lusha, SignalHire, API-based enrichment, and Google search. Confidence scoring and email validation. Automatic integration with outreach campaigns.

### AI-Powered Matching
Compute match scores between your profile and job descriptions using multi-provider AI (GPT-4o, Claude 3.5 Sonnet, Gemini 2.5 Pro, DeepSeek V3). Strategic value analysis identifies high-impact opportunities.

### Outreach Orchestration
Generate personalized outreach drafts per role and company. Schedule follow-up cadences with smart timing. Track responses, replies, and bounce rates. Context-aware follow-ups based on previous interactions.

### Interview Pipeline
Full interview lifecycle — schedule, prep materials, feedback tracking. Calendar integration and automated reminders.

### Inbox Intelligence
Classify Gmail messages by relevance. Surface recruiter replies and application responses. High-value message detection with priority routing.

### Provider Operations
Manage five job providers (LinkedIn, Indeed, Naukri, Wellfound, Instahyre) plus four ATS platforms (Greenhouse, Lever, Ashby, Workable). Enable/disable per provider. Auto-disable on critical failures. Cookie-based authentication with scheduled refresh.

### Telegram Operations
Full operations interface via Telegram bot — provider status, health checks, approval workflows, job listings, system statistics.

### Workflow Automation
Event bus with n8n integration (optional). Webhook-based notifications for job imports, applications, recruiter discoveries, follow-ups, and system alerts.

---

## Architecture

```
  Frontend (TanStack Start)     API/BFF (Nitro SSR)     Supabase (PostgreSQL + RLS)
  React 19 · Tailwind CSS       [...route].ts routing          19 migrations
  File-based routing            Phase A/B handlers         Row Level Security
  TanStack Query                Multi-provider AI              Events table
  shadcn/ui                     Playwright automation       Queue state
```

The system uses a **server-rendered React frontend** with a **Nitro-powered API layer**, **Supabase for persistence**, **Redis/BullMQ for background jobs**, and **n8n for optional notification workflows**.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed breakdown.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | TanStack Start (React 19), TanStack Router, TanStack Query, Tailwind CSS v4, shadcn/ui |
| API | Nitro SSR (Vite-powered), file-based routing in `api/[...route].ts` |
| Database | Supabase PostgreSQL with Row Level Security |
| AI | OpenRouter gateway (GPT-4o, Claude 3.5 Sonnet, Gemini 2.5 Pro, DeepSeek V3) |
| Automation | Playwright with self-healing selectors and real Edge profiles |
| Queues | BullMQ (Redis) with inline fallback |
| Notifications | Event bus → n8n webhooks → Telegram (or direct Telegram) |
| Auth | Supabase Auth (email/password, Google OAuth) |

---

## Quick Start

```bash
git clone https://github.com/chauhandigvijay1/Valtrexa-V2.git
cd Valtrexa-V2
npm.cmd install
cp .env.example .env
# Edit .env with your credentials (see docs/SETUP.md)
npm.cmd run dev
```

Full setup instructions: [docs/SETUP.md](docs/SETUP.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design, stack decisions, data flow |
| [Setup Guide](docs/SETUP.md) | Local development environment setup |
| [Deployment](docs/DEPLOYMENT.md) | Production deployment (Vercel, Railway, Render) |
| [Database](docs/DATABASE.md) | Schema, migrations, RLS policies |
| [API Reference](docs/API_REFERENCE.md) | Internal API routes and handlers |
| [Provider Operations](docs/PROVIDER_OPERATIONS.md) | Job provider integration guide |
| [Provider Failure Registry](docs/PROVIDER_FAILURE_REGISTRY.md) | Known failure patterns and recovery |
| [Telegram Operations](docs/TELEGRAM_OPERATIONS.md) | Bot commands and operations |
| [n8n Operations](docs/N8N_OPERATIONS.md) | Workflow automation and event bus |
| [Security](docs/SECURITY.md) | Auth, RLS, secrets management |
| [Contributing](CONTRIBUTING.md) | Development guide and conventions |
| [Changelog](CHANGELOG.md) | Release history |

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup and conventions
- Code style and linting
- Testing requirements
- Pull request process
- Adding support for new job providers

---

## Author

**Digvijay Kumar Singh**

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/digvijaykumarsingh/)
[![Portfolio](https://img.shields.io/badge/Portfolio-8b5cf6?style=flat-square&logo=google-chrome&logoColor=white)](https://dsc-portfolio-website.netlify.app/)
[![Email](https://img.shields.io/badge/Email-EA4335?style=flat-square&logo=gmail&logoColor=white)](mailto:chauhandigvijay669@gmail.com)

---

<div align="center">

If this project helped you, consider giving it a star ⭐

</div>
