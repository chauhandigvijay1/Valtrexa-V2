# Provider Failure Registry — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29

## LinkedIn

| Failure            | Detection                   | Recovery                                  |
| ------------------ | --------------------------- | ----------------------------------------- |
| Cookie expired     | HTTP validation → `expired` | Re-authenticate, re-extract `li_at`       |
| Anti-bot page      | URL contains `challenge`    | Manual login in browser, wait, re-extract |
| Account restricted | Page text "restricted"      | Check email, verify account               |
| Easy Apply changed | Selector timeout            | Self-healing selector fallback            |
| Rate limited       | HTTP 429                    | Wait 15+ minutes, system retries          |

## Indeed

| Failure        | Detection               | Recovery                    |
| -------------- | ----------------------- | --------------------------- |
| JWT expired    | Response body "expired" | Re-extract `CTK` cookie     |
| Layout changed | Selector failure        | Self-healing fuzzy matching |
| Anti-bot       | CAPTCHA detected        | Manual solve, re-extract    |

## Naukri

| Failure         | Detection               | Recovery                |
| --------------- | ----------------------- | ----------------------- |
| Session expired | Redirect to login       | Re-extract `nauk_sid`   |
| CAPTCHA         | Page contains "captcha" | Manual solve in browser |

## Wellfound

| Failure           | Detection          | Recovery                        |
| ----------------- | ------------------ | ------------------------------- |
| Session expired   | Redirect to login  | Re-extract `_wellfound_session` |
| External redirect | URL changes domain | Handle via manual apply         |

## Instahyre

| Failure         | Detection             | Recovery                             |
| --------------- | --------------------- | ------------------------------------ |
| Session expired | Redirect to login     | Re-extract `sessionid` + `csrftoken` |
| CSRF mismatch   | Form submission fails | Re-extract both cookies              |

## Self-Healing System

The system has three tiers of fallback:

1. **Primary selectors** — Exact CSS matches
2. **Fallback chain** — Multiple selector attempts per field
3. **Fuzzy matching** — Text-based and ARIA label matching

Auto-heal actions:

- Login redirect → re-navigate, recheck
- CAPTCHA → mark as unresolvable (requires user)
- Anti-bot → delay 5s + re-navigate
- Provider downtime → delay 10s + retry
