# Admin Guide

> **Last Updated:** 2026-06-26

## Overview

The admin dashboard is available at `/admin` for users with the `admin` role. It provides system-wide monitoring and control.

## Access

1. User must have `role = 'admin'` in the `profiles` table
2. Navigate to `/admin` in the dashboard
3. Or use Telegram admin commands (`/broadcast`, `/inspect`, `/admin-status`)

## Dashboard Tabs

The admin page (`src/routes/_authenticated/admin.tsx`) has six tabs:

### 1. User Management

| Feature | Description |
|---|---|
| Search users | Find by email, name, or user ID |
| Inspect user | View user profile, provider status, workflow state, analytics |
| Link status | Check if user has linked Telegram |
| Provider health | Per-user provider health overview |

### 2. Broadcast

Send announcements to all linked Telegram users:

- **Message**: Text content of the broadcast
- **Preview**: Shows how the message will appear
- **Send**: Delivers to all users with linked Telegram chats
- **History**: Past broadcasts with delivery statistics

### 3. Provider Controls

System-wide provider management:

| Feature | Description |
|---|---|
| Global toggle | Enable/disable specific providers across all users |
| Health overview | See all providers with health status |
| Auto-disable list | View providers auto-disabled for failures |

### 4. Queue Management

| Feature | Description |
|---|---|
| Queue depth | Current job count per queue |
| Active jobs | Running jobs with duration |
| Failed jobs | Failed jobs with error messages |
| Retry | Re-queue failed jobs |

Available for both `applications` and `outreach` queues.

### 5. Workflow State

| Feature | Description |
|---|---|
| Active workflows | List of users with running workflows |
| Status overview | Counts: running, paused, idle, stopped |
| Force stop | Stop a stuck workflow |

### 6. System Logs

| Feature | Description |
|---|---|
| Workflow events | Paginated event log with severity filtering |
| Error log | Filtered error-level events |
| User filter | View events for specific user |

## Telegram Admin Commands

| Command | Description |
|---|---|
| `/broadcast <message>` | Send announcement to all linked users |
| `/inspect <user_id>` | View user details (profile, providers, workflow) |
| `/admin-status` | System-wide status: user count, queue depth, active workflows |

Admin commands are protected by `TELEGRAM_ADMIN_IDS` env var (comma-separated chat IDs).

## Admin Middleware

All admin API routes use `requireAdmin()` which:
1. Verifies the user is authenticated
2. Checks `profiles.role = 'admin'`
3. Returns 403 if not admin

Admin routes under `api/` are prefixed and protected at the handler level (not by RLS — admin bypasses user-level RLS via service role client).

## Security

- Admin actions use the **service role** Supabase client to bypass RLS
- All admin API calls are logged to `workflow_events` with severity `info`
- Telegram broadcast logs show delivery status per user
- Admin dashboard is only accessible to users with `role = 'admin'`
