# VALTREXA-V2 Database Schema

## Overview

- **Engine:** Supabase PostgreSQL (with Row Level Security)
- **Migrations:** 27 individual numbered migration files in `supabase/migrations/`
- **Reference Snapshot:** `supabase/current_schema.sql` — concatenated full schema (do not apply directly)
- **RLS:** Enabled on every user-owned table; policies restrict access to `auth.uid()` rows

---

## Tables by Domain

### User & Profile

| Table                | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `profiles`           | Core user profile (name, headline, social links, avatar)          |
| `user_roles`         | Role assignments (`admin`, `user`) with uniqueness constraint     |
| `candidate_profiles` | Extended candidate data (years experience, company, open_to_work) |
| `settings`           | Per-user application settings                                     |

### Resume & Skills

| Table              | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `resumes`          | Resume records (title, file path, status)                          |
| `resume_versions`  | Versioned snapshots of resume content per resume                   |
| `skills`           | Skill entries with name, category, and level (`beginner`–`expert`) |
| `projects`         | Personal/academic project entries                                  |
| `experiences`      | Work experience entries                                            |
| `education`        | Education entries                                                  |
| `certifications`   | Certification records                                              |
| `resume_parses`    | AI parsing results for uploaded resumes                            |
| `resume_analyses`  | AI-generated analysis of resume content                            |
| `tailored_resumes` | Job-specific tailored/resume versions                              |

### Jobs & Applications

| Table                 | Purpose                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `companies`           | Company records tracked by the user                                             |
| `jobs`                | Job postings with full metadata (salary, location, type, priority, status)      |
| `job_preferences`     | User-defined job search preferences                                             |
| `applications`        | Application tracking (status workflow: saved → applied → … → accepted/rejected) |
| `application_events`  | Timeline of status changes per application                                      |
| `application_answers` | Stored answers/cover letters per application                                    |
| `job_matches`         | AI-generated match scores with skills/role/experience dimension scores          |
| `job_import_runs`     | Log of bulk job import operations                                               |
| `job_alerts`          | _(future)_ Planned alert configuration (see `alert_preferences`)                |

### Recruiters & Outreach

| Table                     | Purpose                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `recruiters`              | Recruiter contacts (name, company, email, notes)                            |
| `recruiter_conversations` | Conversation threads with recruiters                                        |
| `outreach_campaigns`      | Campaign grouping for mass outreach                                         |
| `outreach_messages`       | Individual outreach messages with status (`draft`, `sent`, `replied`, etc.) |
| `outreach_drafts`         | Saved message templates/drafts                                              |

### Interviews & Events

| Table                   | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `interviews`            | Scheduled interviews (date, type, status, notes)              |
| `interview_preparation` | Prep materials, questions, notes per interview                |
| `events`                | _(via `workflow_events`)_ Internal workflow event bus entries |

### Analytics & AI

| Table              | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `analytics`        | Aggregate user analytics (views, applications, interviews per period) |
| `analytics_events` | Raw event stream for analytics pipelines                              |
| `learning_loop`    | Feedback data for model improvement                                   |
| `ai_generations`   | Log of AI-generated content (cover letters, analyses, etc.)           |
| `candidate_memory` | Long-term memory store for AI agent context                           |
| `candidate_brain`  | Structured knowledge base for candidate insights                      |
| `company_research` | AI-researched company intelligence                                    |
| `assessments`      | Skill/knowledge assessments                                           |
| `painpoints`       | Identified candidate pain points                                      |
| `followups`        | Scheduled follow-up actions                                           |

### Infrastructure & Integrations

| Table                       | Purpose                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| `workflow_events`           | Internal event bus for async workflows (event_type, payload, processed status) |
| `notification_queue`        | Queued notifications (categorized, scheduled, multi-channel)                   |
| `inbox_messages`            | Inbound messages (email, LinkedIn, etc.)                                       |
| `activity_logs`             | Audit trail of user actions                                                    |
| `integrations`              | Third-party OAuth/integration configs                                          |
| `telegram_notifications`    | Telegram-specific notification config                                          |

### Provider Controls

| Table                 | Purpose                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| `provider_controls`   | Global toggle for AI providers (OpenAI, Claude, Gemini, etc.) with health status |
| `provider_health_log` | Health check event log per provider                                              |
| `provider_challenges` | Challenge/verification records for provider fallback logic                       |

---

## Migration Strategy

- Each migration is a standalone `.sql` file prefixed with a timestamp (e.g. `20260529133833_*.sql`)
- `current_schema.sql` is a **concatenated reference snapshot** of all 27 migrations — never apply this file directly
- New changes follow the pattern: create a new numbered migration file in `migrations/`, then regenerate `current_schema.sql`

### Apply Migrations

```bash
npx supabase migration up --linked
```

---

## Row Level Security (RLS)

All user-owned tables follow a uniform pattern:

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Policy: `"<short> owner all" FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
- `service_role` bypasses RLS with full `GRANT ALL`

**Exceptions (admin-wide access):**

- `provider_controls` — policy allows all authenticated users to read/write (`USING (true)`)
- `provider_health_log` — same admin-level access
- `provider_challenges` — same admin-level access

Storage RLS policies on `storage.objects` restrict file access to the owning user.

---

## Key Indexes

| Index                                | Table                       | Columns                                   |
| ------------------------------------ | --------------------------- | ----------------------------------------- |
| `idx_applications_user`              | `applications`              | `user_id`                                 |
| `idx_applications_status`            | `applications`              | `status`                                  |
| `idx_jobs_user`                      | `jobs`                      | `user_id`                                 |
| `idx_jobs_status`                    | `jobs`                      | `status`                                  |
| `idx_jobs_experience_level`          | `jobs`                      | `experience_level`                        |
| `idx_jobs_work_mode`                 | `jobs`                      | `work_mode`                               |
| `idx_jobs_normalized_roles`          | `jobs`                      | GIN on `normalized_roles`                 |
| `idx_jobs_salary_min/max`            | `jobs`                      | `salary_min`, `salary_max`                |
| `idx_jobs_user_source`               | `jobs`                      | `(user_id, source)`                       |
| `idx_job_matches_user_job`           | `job_matches`               | `(user_id, job_id)`                       |
| `idx_interviews_user`                | `interviews`                | `user_id`                                 |
| `idx_interviews_scheduled`           | `interviews`                | `scheduled_at`                            |
| `idx_outreach_messages_user`         | `outreach_messages`         | `user_id`                                 |
| `idx_notification_queue_user_status` | `notification_queue`        | `(user_id, status, scheduled_for)`        |
| `idx_inbox_messages_user_received`   | `inbox_messages`            | `(user_id, received_at DESC)`             |
| `idx_workflow_events_user`           | `workflow_events`           | `user_id`                                 |
| `idx_candidate_brain_user`           | `candidate_brain`           | `user_id`                                 |
| `idx_phl_provider_event`             | `provider_health_log`       | `(provider, event_type, created_at DESC)` |

Every user-scoped table also has a `idx_<table>_user` index on the `user_id` column.
