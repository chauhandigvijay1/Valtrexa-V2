# API Reference — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29  
> **Base URL:** https://valtrexa-v2.vercel.app/api

## Authentication

All API routes require authentication via `requireApiUser()` middleware:

- Header: `Authorization: Bearer <supabase_access_token>`
- Unauthenticated requests: 401
- Unconfirmed email (password users): 403

## Rate Limiting

- 100 requests per 60s per IP (configurable)
- Returns 429 with `retry-after` header when exceeded

## Phase A — Data Layer

| Method | Endpoint               | Description                       |
| ------ | ---------------------- | --------------------------------- |
| GET    | `/api/provider-audit`  | Provider data audit               |
| POST   | `/api/import-jobs`     | Trigger job import from providers |
| GET    | `/api/job-matches`     | Match-scored job listings         |
| GET    | `/api/recruiters`      | Discovered recruiter list         |
| GET    | `/api/skills-gap`      | Skills gap analysis               |
| GET    | `/api/resume-parse`    | Parse resume content              |
| GET    | `/api/candidate-brain` | Full candidate brain data         |
| POST   | `/api/candidate-brain` | Update candidate brain            |

## Phase B — Action Layer

| Method | Endpoint                  | Description                           |
| ------ | ------------------------- | ------------------------------------- |
| POST   | `/api/submit-application` | Submit job application via Playwright |
| POST   | `/api/batch-apply`        | Batch application run                 |
| POST   | `/api/outreach`           | Generate and send outreach            |
| POST   | `/api/followups`          | Process follow-up cadences            |
| POST   | `/api/inbox-sync`         | Sync Gmail inbox                      |

## Auth

| Method | Endpoint                   | Description                            |
| ------ | -------------------------- | -------------------------------------- |
| POST   | `/api/auth/create-profile` | Create user profile on signup          |
| POST   | `/api/auth/log-event`      | Log auth event (signup, login, logout) |

## Cookies

| Method | Endpoint                 | Description                 |
| ------ | ------------------------ | --------------------------- |
| GET    | `/api/cookies`           | List all cookies for user   |
| POST   | `/api/cookies/set`       | Set a cookie for a provider |
| POST   | `/api/cookies/validate`  | Validate a cookie           |
| DELETE | `/api/cookies/:provider` | Delete cookie for provider  |

## Provider Controls

| Method | Endpoint                 | Description                   |
| ------ | ------------------------ | ----------------------------- |
| GET    | `/api/providers`         | List provider statuses        |
| POST   | `/api/providers/:action` | Enable/disable/pause provider |
| GET    | `/api/providers/health`  | Provider health log           |

## Webhooks

| Method | Endpoint                | Description              |
| ------ | ----------------------- | ------------------------ |
| POST   | `/api/telegram/webhook` | Telegram bot updates     |
| POST   | `/api/telegram/binding` | Telegram account binding |

## Admin

| Method | Endpoint               | Description                    |
| ------ | ---------------------- | ------------------------------ |
| GET    | `/api/admin/users`     | List all users                 |
| POST   | `/api/admin/broadcast` | Send notification to all users |
| GET    | `/api/admin/queues`    | Queue status                   |
| GET    | `/api/admin/system`    | System health                  |

## Error Responses

```json
{ "error": "Description of what went wrong" }
```

Common status codes:

- 200: Success
- 400: Bad request (missing/invalid fields)
- 401: Unauthorized (no token)
- 403: Forbidden (unconfirmed email, insufficient role)
- 404: Not found
- 429: Rate limited
- 500: Internal server error
