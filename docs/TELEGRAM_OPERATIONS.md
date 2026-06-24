# Telegram Operations — VALTREXA-V2

## Overview

The Telegram bot serves as the primary operational interface for VALTREXA-V2. Operators manage providers, review applications, monitor system health, and receive alerts — all via chat commands and inline keyboards.

## Setup

### Bot Token

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Copy the token and set as environment variable:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### Webhook Registration

The webhook URL is `{PUBLIC_URL}/api/telegram/webhook`. Registration happens automatically on startup via `initTelegramBot()` (`api/_lib/telegram-init.ts`), or manually:

```bash
# Manual registration
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/api/telegram/webhook"

# Verify
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Required environment variables:

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `TELEGRAM_CHAT_ID` or `ADMIN_CHAT_ID` | Admin chat ID for alerts and notifications |
| `PUBLIC_URL` | Public base URL for webhook endpoint |

### Command Registration

Slash commands are registered with Telegram via `setMyCommands` on startup (`registerTelegramCommands()`). The script `scripts/setup-telegram.ts` can also be run manually.

## Slash Commands

### System

| Command | Handler | Description |
|---|---|---|
| `/health` | `handleHealthCommand` | System health check — database connectivity, bot status, uptime |
| `/start` | (same as `/health`) | Alias for health check |
| `/status` | `handleStatusCommand` | Dashboard summary — total jobs, applications, interviews, assessments, offers |
| `/analytics` | `handleAnalyticsCommand` | Full analytics summary with last-updated timestamp |

### Data

| Command | Handler | Description |
|---|---|---|
| `/jobs` | `handleJobsCommand` | Last 10 imported jobs |
| `/applications` | `handleApplicationsCommand` | Last 10 applications |
| `/recruiters` | `handleRecruitersCommand` | Discovered recruiters |
| `/interviews` | `handleInterviewsCommand` | Detected upcoming interviews |
| `/highvalue` | `handleHighValueCommand` | High-value companies ranked by strategic score |
| `/followups` | `handleFollowupsCommand` | Overdue follow-ups |

### Provider Management

| Command | Handler | Description |
|---|---|---|
| `/provider-status` | `handleProviderStatusCommand` | Provider status overview (enabled/disabled/paused, failures, last error) |
| `/provider-history [name]` | `handleProviderHistoryCommand` | Health event log for all providers or a specific provider |
| `/provider-enable <name>` | `handleProviderEnableCommand` | Enable a provider (sends alert notification) |
| `/provider-disable <name>` | `handleProviderDisableCommand` | Disable a provider (sends alert notification) |
| `/provider-pause <name>` | `handleProviderPauseCommand` | Pause a provider |
| `/provider-resume <name>` | `handleProviderResumeCommand` | Resume a paused provider |

### Approvals

| Command | Handler | Description |
|---|---|---|
| `/approvals` | `handleApprovalsCommand` | List all pending approvals (applications and batch apply items) |

### Inline Keyboard Callbacks

Inline buttons on notification messages trigger these callbacks via `handleCallbackQuery`:

| Action | Entity Types | Description |
|---|---|---|
| `approve` | `application`, `batch_apply_item`, `outreach` | Approve and (for applications) submit via Playwright |
| `reject` | `application`, `batch_apply_item`, `outreach` | Reject and mark as rejected |
| `view` | `application` | View job details |
| `review` | `application` | View AI-generated answers before approving |

## Alert Channels

All alerts are sent via Telegram to `TELEGRAM_CHAT_ID` / `ADMIN_CHAT_ID`.

### Health Alerts (Severity: critical)

| Alert Function | Event | Trigger |
|---|---|---|
| `alertCookieExpired` | `cookie_expired` | Provider cookie/session expired |
| `alertLoginFailure` | `login_redirect` | Session expired, page redirected to login |
| `alertCaptcha` | `captcha_detected` | CAPTCHA challenge detected |
| `alertAntiBot` | `anti_bot_page` | Anti-bot / rate-limit page detected |
| `alertProviderDisabled` | `provider_disabled` | Provider auto-disabled after repeated failures or manually disabled |

### Failure Notifications (Severity: warning)

| Alert Function | Event | Trigger |
|---|---|---|
| `alertWorkflowFailure` | `stuck_workflow` | n8n workflow failure |
| `alertQueueFailure` | `stuck_queue` | BullMQ queue stuck |
| `alertApplicationFailure` | `submission_failure` | Application submission failed |
| `alertSelectorFailure` | `selector_failure` | Page selector not found (layout change) |

### Informational (Severity: info)

| Alert Function | Event | Trigger |
|---|---|---|
| `alertProviderEnabled` | `provider_re_enabled` | Provider manually re-enabled |
| `sendDailyHealthSummary` | (daily summary) | Cron-driven daily provider health summary |

### Automatic Notifications

| Function | Trigger | Interaction |
|---|---|---|
| `notifyApplicationForApproval` | Application requires manual approval | Inline ✅ / ❌ buttons |
| `notifyJobImport` | Job import pipeline completes | Read-only message |
| `notifyRecruiterDiscovery` | New recruiters found | Read-only message |
| `notifyOutreachDraft` | Outreach draft generated | Inline ✅ / ❌ buttons |
| `notifyInterview` | Interview email detected | Read-only message |
| `notifyAssessment` | Assessment email detected | Read-only message |
| `notifyOffer` | Offer email detected | Read-only message |
| `notifyBatchApplyApproval` | Batch apply items pending approval | Per-item inline ✅ / ❌ buttons |

## Webhook Handling

Incoming updates are processed by `processTelegramUpdate()` in `api/_lib/telegram.ts`:

1. **Text messages** — parsed for leading `/` commands; matched against the command switch; unknown commands return `{ handled: false }`.
2. **Callback queries** — `callback_query.data` is split on `:` into `action:entityType:entityId` triple; routed to `approve`, `reject`, `view`, or `review` handlers.
3. Non-matching or non-text updates return `{ handled: false }`.

The webhook endpoint is mounted at `POST /api/telegram/webhook`.

## Troubleshooting

### Verification Script

Run `scripts/verify-telegram.ts` to check all three layers:

```bash
npx tsx scripts/verify-telegram.ts
```

It verifies:
- Command registration (`getMyCommands`)
- Webhook status (`getWebhookInfo`)
- Message delivery (sends a test message to your chat ID)

### Setup Script

Run `scripts/setup-telegram.ts` to:

```bash
npx tsx scripts/setup-telegram.ts
```

- Register slash commands via `setMyCommands`
- Display current webhook info
- Drain any pending updates via `getUpdates`

### Common Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| Bot does not respond | Webhook not set or URL incorrect | Verify with `getWebhookInfo`; re-run webhook registration |
| `TELEGRAM_BOT_TOKEN is not configured` | Env var missing | Set `TELEGRAM_BOT_TOKEN` in `.env` |
| `PUBLIC_URL not configured` | Env var missing in production | Set `PUBLIC_URL` to the deployed app base URL |
| Commands not showing in chat | `setMyCommands` not called | Run `registerTelegramCommands()` or `setup-telegram.ts` |
| Alerts not delivered | `TELEGRAM_CHAT_ID` or `ADMIN_CHAT_ID` not set | Set the correct chat ID in env |
| `404` on webhook endpoint | Route not mounted | Ensure `/api/telegram/webhook` handler is registered |
| Pending updates piling up | Webhook changed or failed | Check `getWebhookInfo`; drain with `getUpdates` |
| "Unknown provider" on command | Provider name typo or not in `PROVIDERS` list | Run `/provider-status` to see valid names |
