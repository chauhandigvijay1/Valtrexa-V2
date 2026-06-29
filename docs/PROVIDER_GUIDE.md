# Provider Guide — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29

## Supported Providers

| Provider  | Type             | Auth Method | Auto-Apply | Job Discovery | Cookie Names             |
| --------- | ---------------- | ----------- | ---------- | ------------- | ------------------------ |
| LinkedIn  | Social/Job Board | Cookie      | ✅         | ✅            | `li_at`                  |
| Indeed    | Job Board        | Cookie      | ✅         | ✅            | `CTK`                    |
| Naukri    | Job Board        | Cookie      | ✅         | ✅            | `nauk_sid`               |
| Wellfound | Startup Jobs     | Cookie      | ✅         | ✅            | `_wellfound_session`     |
| Instahyre | Job Board        | Cookie      | ✅         | ✅            | `sessionid`, `csrftoken` |

## Auth Methods

### Cookie-Based (All 5 providers)

Session cookies are encrypted (AES-256-GCM) and stored per-user. Users extract cookies from their browser and paste them via dashboard or Telegram.

## Provider Controls

Manage providers via:

- **Dashboard**: Settings → Cookies
- **Telegram**: `/providers`, `/provider_enable`, `/provider_disable`
- **API**: Provider control endpoints

Each provider has a status (enabled, disabled, paused, maintenance) and a health log.

## Auto-Disable Flow

1. Cookie validation fails → provider **paused**
2. Consecutive failures during Playwright → provider **disabled** (auto)
3. User must re-authenticate and re-paste cookies to re-enable
