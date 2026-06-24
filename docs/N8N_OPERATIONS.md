# N8N Operations — VALTREXA-V2

## Overview

[n8n](https://n8n.io) is an optional notification and automation engine for VALTREXA-V2. It runs as a self-hosted Docker container alongside the core API, receiving webhook-triggered events and routing them to downstream channels (Telegram, email, Slack, etc.). The entire n8n integration is designed to be **pluggable** — the core platform functions fully without it, and n8n can be enabled or disabled via the `N8N_ENABLED` environment variable.

---

## Event Bus Architecture

The event delivery pipeline follows three stages:

```
┌──────────────┐     ┌──────────────────────┐     ┌───────────────────┐
│  Application  │ ──▶ │  workflow_events      │ ──▶ │  n8n_webhook       │
│  Code         │     │  (event persistence)  │     │  _subscriptions    │
│  (emit)       │     └──────────────────────┘     │  (delivery table)  │
└──────────────┘                                    └─────────┬─────────┘
                                                              │ HTTP POST
                                                              │ (x-valtrexa-v2-secret)
                                                              ▼
                                                   ┌───────────────────┐
                                                   │  n8n Workflow     │
                                                   │  (Master Hub)     │
                                                   └───────────────────┘
```

1. **Emit** — `api/_lib/workflow-events.ts` exports `emitWorkflowEvent()`, which inserts a row into the `workflow_events` table and then synchronously delivers to matching webhook subscriptions.

2. **Subscriptions** — The `n8n_webhook_subscriptions` table maps `(user_id, event_type) → target_url + secret`. The `registerConsumer()` function in `api/_lib/event-bus.ts` manages these rows. Each row represents one webhook endpoint that should receive a specific event type.

3. **Delivery** — `deliverToConsumer()` in `event-bus.ts` sends an HTTP POST with:
   - `Content-Type: application/json`
   - Header `x-valtrexa-v2-secret: <hmac-secret>` (when a secret is configured)
   - Body: `{ userId, eventId, payload, occurredAt }`
   - 10-second timeout via `AbortSignal.timeout(10000)`

Delivery attempts are recorded in `workflow_event_deliveries` for observability.

---

## Master Notification Hub Workflow

The canonical n8n workflow is `VALTREXA-V2 — Master Notification Hub` (exported at `n8n-workflows/exported-master-workflow.json`). It uses **8 webhook triggers**, each listening on a unique path:

| Webhook Trigger               | n8n Path                            | webhookId                  |
|-------------------------------|-------------------------------------|----------------------------|
| `job_import_completed`        | `/webhook/job-import-completed`     | `valtrexa-v2-job-import`   |
| `application_submitted`       | `/webhook/application-submitted`    | `valtrexa-v2-app-submit`   |
| `recruiter_discovered`        | `/webhook/recruiter-discovered`     | `valtrexa-v2-rec-discover` |
| `outreach_generated`          | `/webhook/outreach-generated`       | `valtrexa-v2-outreach`     |
| `followup_due`                | `/webhook/followup-due`             | `valtrexa-v2-followup`     |
| `inbox_classified`            | `/webhook/inbox-classified`         | `valtrexa-v2-inbox`        |
| `high_value_detected`         | `/webhook/high-value-detected`      | `valtrexa-v2-high-value`   |
| `telegram_event`              | `/webhook/telegram-event`           | `valtrexa-v2-telegram`     |

Each trigger receives the same envelope structure:

```json
{
  "userId": "uuid",
  "eventId": "uuid",
  "eventType": "job_import_completed",
  "entityType": "job",
  "entityId": "uuid-or-null",
  "payload": { },
  "occurredAt": "2026-06-23T07:44:39.164Z"
}
```

Downstream nodes in the workflow typically include switch routers, Set nodes for message formatting, and Telegram bots for user-facing notifications.

---

## Event Delivery Mechanism

All webhook deliveries are **HTTP POST** requests with the following characteristics:

| Property            | Value                                    |
|---------------------|------------------------------------------|
| Method              | `POST`                                   |
| Content-Type        | `application/json`                       |
| Auth Header         | `x-valtrexa-v2-secret: <hmac-secret>`    |
| Timeout             | 10 seconds                               |
| Retry               | None at transport layer (event bus only) |
| Delivery Log        | `workflow_event_deliveries` table        |

The `x-valtrexa-v2-secret` header carries the HMAC secret stored in the subscription row. n8n workflows can validate this header via an incoming webhook's "Response Headers" or a Function node to reject unauthenticated requests.

---

## Subscription Management

Subscriptions are stored in the `n8n_webhook_subscriptions` table:

| Column        | Type      | Description                              |
|---------------|-----------|------------------------------------------|
| `id`          | `uuid`    | Primary key                              |
| `user_id`     | `uuid`    | Owner of the subscription                |
| `event_type`  | `text`    | Event type to match (or `*` for all)     |
| `target_url`  | `text`    | n8n webhook URL                          |
| `secret`      | `text?`   | HMAC secret for `x-valtrexa-v2-secret`   |
| `enabled`     | `boolean` | Toggle without deleting                  |
| `created_at`  | `timestamptz` |                                       |

**API surface:**

- `registerConsumer(userId, { name, type, target, eventTypes, secret })` — creates one row per `event_type`. Type `"webhook"` or `"n8n"` routes to `n8n_webhook_subscriptions`; other types route to `integrations`.
- `listConsumers(userId)` — returns all webhook + integration consumers for a user.
- `deliverToConsumer(userId, eventId, consumer, payload)` — delivers to a single consumer and records outcome.
- `replayEvent(userId, eventId)` — re-delivers a past event to all matching consumers.

---

## Importing / Exporting Workflows

### Export from n8n

1. Open the n8n UI (`http://localhost:5678`).
2. Navigate to **Workflows** → select `VALTREXA-V2 — Master Notification Hub`.
3. Click **⋮** (three dots) → **Download**.
4. Save the JSON file to `n8n-workflows/exported-master-workflow.json`.

### Import to n8n

```bash
# Using n8n CLI (when n8n is running):
n8n import:workflow --input ./n8n-workflows/exported-master-workflow.json

# Or via the UI:
# Workflows → Add Workflow → ⋮ → Import from File
```

### Versioning

All exported workflow JSON files live in `n8n-workflows/` and are committed to the repository. The naming convention is:

```
n8n-workflows/
  exported-master-workflow.json     # Latest export of Master Hub
```

After editing the workflow in the n8n UI, always re-export and commit the updated file.

---

## Verification

The script `scripts/verify-n8n-workflow.ts` validates that the n8n instance is running the expected workflow. It:

1. Connects to the local n8n SQLite database at `~/.n8n/database.sqlite`.
2. Queries `workflow_entity` for a workflow whose name contains `VALTREXA-V2`.
3. Reports: workflow name, ID, active status, version counter, node count, connection count.
4. Lists every node with its icon, name, type, webhookId, and Telegram chatId.
5. Reads `n8n-workflows/exported-master-workflow.json` and compares node names against the database.
6. Reports missing/extra nodes and a final pass/fail message.

### Usage

```bash
# From the project root (requires n8n running locally):
npx tsx scripts/verify-n8n-workflow.ts
```

### Expected output on success

```
Workflow: VALTREXA-V2 — Master Notification Hub (WLhDG8aBYN1hNkCK)
Active: true
Version: 1 (abc123...)
Nodes: 12
Connections: 8 sources

Nodes:
  🪝 Webhook: job_import_completed (n8n-nodes-base.webhook)
  🔀 Switch: route_by_channel (n8n-nodes-base.switch)
  ...

✅ DB matches exported workflow (node names)
```

### Troubleshooting verification failures

| Symptom                     | Likely Cause                           | Fix                                          |
|-----------------------------|----------------------------------------|----------------------------------------------|
| `No VALTREXA-V2 workflow`   | Workflow not imported or renamed       | Import from `n8n-workflows/`                  |
| Node count mismatch         | Nodes added/removed in UI but not exported | Export workflow and commit updated JSON |
| DB connection error         | n8n not running or wrong DB path       | Start n8n; verify `~/.n8n/database.sqlite`   |

---

## Troubleshooting

### n8n connectivity

```bash
# Check if n8n is running:
curl -s http://localhost:5678/healthz  # expects 200 OK

# Check Docker status:
docker ps --filter "name=n8n" --format "{{.Names}} {{.Status}}"

# Check N8N_ENABLED env var:
grep N8N_ENABLED .env
```

### Webhook 404 errors

If the API logs show `404` when POSTing to n8n webhooks:

1. **Workflow not active** — In the n8n UI, ensure `VALTREXA-V2 — Master Notification Hub` has the **Active** toggle enabled.
2. **Path mismatch** — Verify `target_url` in `n8n_webhook_subscriptions` matches the exact path in the workflow's webhook node (e.g., `http://n8n:5678/webhook/job-import-completed`).
3. **Wrong n8n base URL** — The `N8N_WEBHOOK_URL` environment variable must point to the n8n instance reachable from the API container. For Docker Compose, use `http://n8n:5678`.
4. **Webhook ID changed** — If the workflow was re-imported, webhook IDs may have changed. Re-export the workflow and update subscription target URLs.

### Event delivery failures

Check `workflow_event_deliveries` in the database:

```sql
SELECT consumer, status, status_code, response_snippet, delivered_at
FROM workflow_event_deliveries
WHERE event_id = '<event-uuid>'
ORDER BY created_at DESC;
```

| `status_code` | Meaning                                |
|---------------|----------------------------------------|
| `200`         | Delivered successfully                 |
| `404`         | Webhook path not found (see above)     |
| `500`         | n8n workflow error (check n8n logs)    |
| `null`        | Network error / timeout (10s deadline) |

### n8n logs

```bash
# Docker logs:
docker logs n8n --tail 50

# n8n internal workflow execution log:
# Access via n8n UI → Workflows → Executions → select failed execution
```

### Replaying failed events

```bash
# Via the API (requires admin key):
curl -X POST http://localhost:4173/api/events/<event-id>/replay \
  -H "Authorization: Bearer <admin-key>"
```

This calls `replayEvent()` in `event-bus.ts`, which re-delivers the event to all matching consumers and updates the event's `delivered` and `delivered_count` fields.
