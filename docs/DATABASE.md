# Database — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29  
> **Provider:** Supabase (PostgreSQL 15.x)

## Table Groups

### User & Profile

| Table                | Purpose                                              | RLS                    |
| -------------------- | ---------------------------------------------------- | ---------------------- |
| `profiles`           | User profiles (name, headline, location, links)      | `id = auth.uid()`      |
| `candidate_profiles` | Extended candidate data (experience, skills, resume) | `user_id = auth.uid()` |
| `candidate_memory`   | AI memory for form auto-fill                         | `user_id = auth.uid()` |

### Resume & Skills

| Table              | Purpose                               | RLS                    |
| ------------------ | ------------------------------------- | ---------------------- |
| `resumes`          | Resume records (title, is_primary)    | `user_id = auth.uid()` |
| `resume_versions`  | File URL + parsed content per version | `user_id = auth.uid()` |
| `tailored_resumes` | Job-specific tailored resume versions | `user_id = auth.uid()` |
| `skills`           | Skills with category and level        | `user_id = auth.uid()` |

### Jobs & Applications

| Table          | Purpose                         | RLS                    |
| -------------- | ------------------------------- | ---------------------- |
| `jobs`         | Imported job listings           | `user_id = auth.uid()` |
| `applications` | Application records with status | `user_id = auth.uid()` |

### Recruiters & Outreach

| Table                 | Purpose                       | RLS                    |
| --------------------- | ----------------------------- | ---------------------- |
| `recruiters`          | Discovered recruiter profiles | `user_id = auth.uid()` |
| `outreach_messages`   | Generated outreach drafts     | `user_id = auth.uid()` |
| `email_verifications` | Verified email addresses      | `user_id = auth.uid()` |

### Provider Controls

| Table                 | Purpose                          | RLS                    |
| --------------------- | -------------------------------- | ---------------------- |
| `provider_controls`   | Per-user provider enable/disable | `user_id = auth.uid()` |
| `provider_cookies`    | Encrypted session cookies        | `user_id = auth.uid()` |
| `provider_health_log` | Health events per provider       | `user_id = auth.uid()` |

### Infrastructure

| Table             | Purpose                  | RLS                    |
| ----------------- | ------------------------ | ---------------------- |
| `workflow_state`  | Workflow state machine   | `user_id = auth.uid()` |
| `workflow_events` | Event audit log          | `user_id = auth.uid()` |
| `notifications`   | User notification center | `user_id = auth.uid()` |

## Migration Strategy

27 migration files in `supabase/migrations/`, numbered by timestamp. Apply in alphanumeric order via Supabase SQL Editor. After all migrations: `NOTIFY pgrst, 'reload schema';`
