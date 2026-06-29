# Provider Operations — VALTREXA-V2

> **Version:** v1.0.0 | **Last updated:** 2026-06-29

## Supported Providers

| Provider  | Auth   | Key Cookies              | Apply Type |
| --------- | ------ | ------------------------ | ---------- |
| LinkedIn  | Cookie | `li_at`                  | Playwright |
| Indeed    | Cookie | `CTK`                    | Playwright |
| Naukri    | Cookie | `nauk_sid`               | Playwright |
| Wellfound | Cookie | `_wellfound_session`     | Playwright |
| Instahyre | Cookie | `sessionid`, `csrftoken` | Playwright |

## Cookie Refresh Workflow

### Automated (Local Machine)

```bash
npx.cmd tsx scripts/refresh-cookies.ts --provider linkedin --user-id <UUID>
```

Requires Edge with logged-in session.

### Manual (Any Machine)

1. Login to provider in browser
2. DevTools → Application → Cookies → Copy values
3. Paste in VALTREXA-V2 dashboard

## Batch Application Pipeline

### Strategies

1. **Conservative** — Tier A only, Easy Apply, ≤3 days old, min 85% match
2. **Balanced** — Tiers A+B, Easy Apply preferred, ≤7 days, min 70% match
3. **Aggressive** — All tiers, any apply type, ≤30 days, min 50% match

### Approval Mode

When enabled, applications wait for Telegram approval before submission:

- ✅ Approve → Submit
- ✏️ Edit → User provides corrected answer
- ⏭️ Skip → Skip this application
- 🔁 Always → Save answer permanently
- 🚫 Never → Skip similar questions in future

## Recovery Procedures

| Issue            | Action                                    |
| ---------------- | ----------------------------------------- |
| Expired cookie   | Re-authenticate → re-extract → re-paste   |
| Auto-disabled    | Fix cookie → manually re-enable           |
| Maintenance mode | Wait for auto-recovery or manual override |
| Rate limited     | Wait — the system automatically backs off |
