# Workflow Engine — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29

## Overview

Two pipelines run in configurable cycles (default: every 30 minutes):

**Pipeline A** — Auto-apply to matched jobs on 5 job boards
**Pipeline B** — High-value recruiter outreach with AI-generated messaging

## State Machine

```
  ┌────┐
  │idle│◀──────────────┐
  └──┬─┘                │
     │ start             │
     ▼                   │
  ┌─────────┐   pause   ┌───────┐
  │ running │──────────▶│paused │
  └──┬──────┘           └───┬───┘
     │                      │
     │ stop / error         │ resume
     ▼                      ▼
  ┌──────┐           ┌─────────┐
  │stopped│◀────────│ running │
  └───────┘           └─────────┘
```

- **idle**: No workflow running
- **running**: Cycle in progress
- **paused**: User paused mid-cycle
- **stopped**: Cycle ended (completion, error, or user stop)
- Auto-cleanup: stale workflows (>2h without update) are auto-stopped

## Pipeline A: Auto-Apply

### Stages

1. **Precheck** — Validate cookies, provider health, candidate brain completeness
2. **Discover** — Import new jobs from all enabled providers
3. **Match** — Score jobs against candidate profile (8 factors)
4. **Apply** — For matched jobs, run Playwright automation
5. **Evidence** — Capture screenshots + HTML, store in `apply_evidence`

### Strategies

| Strategy     | Tiers   | Easy Apply | Freshness | Approval | Min Score |
| ------------ | ------- | ---------- | --------- | -------- | --------- |
| Conservative | A only  | Required   | ≤3 days   | Required | 85%       |
| Balanced     | A, B    | Preferred  | ≤7 days   | Optional | 70%       |
| Aggressive   | A, B, C | Any        | ≤30 days  | Disabled | 50%       |

### Rate Limits

- Max 50 applications per cycle (configurable)
- 3-second delay between submissions per provider
- Browser timeout: 120 seconds per application

## Pipeline B: High-Value Outreach

### Stages

1. **Precheck** — Same as Pipeline A
2. **Company Research** — Deep-dive into target companies (pain points, tech stack, culture)
3. **Tier Assignment** — Strategic value scoring (A = outreach, B = nurture, C = monitor)
4. **Recruiter Discovery** — Find recruiters + verify emails
5. **Email Generation** — AI-crafted personalized messaging (OpenRouter)
6. **Outreach Execution** — Send via Gmail API with follow-up cadence (Day 3/7/14)

## Configuration Defaults

| Setting         | Default    | Description                              |
| --------------- | ---------- | ---------------------------------------- |
| Cycle interval  | 30 minutes | Time between pipeline runs               |
| Batch size      | 50         | Max applications per cycle               |
| Approval mode   | Disabled   | Requires Telegram approval before submit |
| Min match score | 70%        | Job match threshold                      |
| Max retries     | 3          | Per-application retry count              |
| Browser timeout | 120s       | Per-application timeout                  |

## Recovery & Error Handling

- **Phase-level isolation**: Each stage has its own try-catch
- **Auto-retry**: Transient failures retried (3 attempts with backoff)
- **Manual recovery**: Failed applications can be retried via dashboard
- **Self-healing**: Fallback selectors, fuzzy element matching, navigation auto-heal
- **Stale workflow cleanup**: >2h without update → auto-stopped
