# Admin Guide — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29  
> **Production URL:** https://valtrexa-v2.vercel.app

## Dashboard

The admin panel is at `/admin` (requires authenticated session with admin privileges).

### Tabs

1. **User Management** — View/manage user accounts
2. **Broadcast** — Send notifications to all users
3. **Provider Controls** — Global provider enable/disable
4. **Queue Management** — BullMQ queue monitoring
5. **Workflow State** — View all running workflows
6. **System Logs** — health_log, workflow_events, audit trail

## Telegram Admin Commands (Planned)

> ⚠️ These admin commands are **not yet implemented** in the Telegram handler. They require adding command handlers + admin-role checks.

| Command                | Description                         | Status  |
| ---------------------- | ----------------------------------- | ------- |
| `/broadcast <message>` | Send message to all connected users | Planned |
| `/inspect <user_id>`   | View user details (admin only)      | Planned |
| `/admin-status`        | Full system health report           | Planned |

For now, use the web admin dashboard at `/admin` for user management and system monitoring.

## Security

- Admin routes use `requireAdmin()` middleware
- Admin privileges are role-based (Supabase auth metadata)
- All admin actions are logged to `workflow_events`
- Service role client used for admin operations (bypasses RLS)
