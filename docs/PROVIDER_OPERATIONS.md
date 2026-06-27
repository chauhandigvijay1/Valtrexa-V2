# Provider Operations — VALTREXA-V2

## 1. Supported Providers

### Job Board Providers (Cookie-based)

| Provider      | Key Cookies                                     | Status    |
| ------------- | ----------------------------------------------- | --------- |
| **LinkedIn**  | `li_at`                                         | ✅ Active |
| **Indeed**    | `__Secure-PassportAuthProxy-BearerToken`, `CTK` | ✅ Active |
| **Naukri**    | `nauk_sid`, `nauk_cs`                           | ✅ Active |
| **Wellfound** | `_wellfound`, `remember_token`                  | ✅ Active |
| **Instahyre** | `sessionid`                                     | ✅ Active |

All five support `JobProvider`, `RecruiterProvider`, and `ApplicationProvider` interfaces. They require valid session cookies extracted from a logged-in browser profile.

### ATS Providers (Public API — no auth)

| Provider       | Board Config                                  | Status    |
| -------------- | --------------------------------------------- | --------- |
| **Greenhouse** | `boardToken`                                  | ✅ Active |
| **Lever**      | `site`                                        | ✅ Active |
| **Ashby**      | `boardUrl`                                    | ✅ Active |
| **Workable**   | `boardUrl` or `subdomain` + optional `apiKey` | ✅ Active |

ATS providers implement `JobProvider` only (`jobsSupported: true`). Recruiter discovery and application submission are not supported — return `NOT_SUPPORTED` / `MANUAL_APPLY_REQUIRED`.

### Provider Registry

Defined in `api/_lib/providers.ts:361` as `PROVIDER_REGISTRY`:

```
greenhouse, lever, ashby, workable, linkedin, indeed, naukri, wellfound, instahyre
```

`getProvider(name)` instantiates the correct class via switch on `sourceName.toLowerCase()`.

### Capabilities Matrix

| Provider   | Auth Method      | Jobs | Recruiters | Applications             |
| ---------- | ---------------- | ---- | ---------- | ------------------------ |
| Greenhouse | `public_board`   | ✅   | ❌         | ❌ (manual)              |
| Lever      | `public_board`   | ✅   | ❌         | ❌ (manual)              |
| Ashby      | `public_board`   | ✅   | ❌         | ❌ (manual)              |
| Workable   | `public_board`   | ✅   | ❌         | ❌ (manual)              |
| LinkedIn   | `session_cookie` | ✅   | ✅         | ✅ (requires Playwright) |
| Indeed     | `session_cookie` | ✅   | ✅         | ✅ (requires Playwright) |
| Naukri     | `session_cookie` | ✅   | ✅         | ✅ (requires Playwright) |
| Wellfound  | `session_cookie` | ✅   | ✅         | ✅ (requires Playwright) |
| Instahyre  | `session_cookie` | ✅   | ✅         | ✅ (requires Playwright) |

## 2. Authentication Model

### Cookie-based Providers

Session cookies are stored in `.env` as `{PROVIDER}_COOKIE` (e.g., `LINKEDIN_COOKIE`). The `importJobs` method checks `config.headers.cookie` — if missing, returns `READY_FOR_CREDENTIALS` so the caller knows auth is required.

### ATS Providers

No cookies needed. Greenhouse uses a board token (`config.boardToken`), Lever uses a site slug (`config.site`), Ashby uses a board URL (`config.boardUrl`), Workable uses a board URL or subdomain. If config is missing, returns `READY_FOR_CREDENTIALS`.

### Auth Method Types

```typescript
"public_board" | "session_cookie" | "api_key" | "oauth" | "none";
```

## 3. Provider Controls System

### Database Schema — `provider_controls` table

| Column                 | Type                                     | Description                                |
| ---------------------- | ---------------------------------------- | ------------------------------------------ |
| `provider`             | `text`                                   | Provider name (PK)                         |
| `status`               | `enabled\|disabled\|paused\|maintenance` | Current operating status                   |
| `failure_count`        | `int`                                    | Total failures since inception             |
| `consecutive_failures` | `int`                                    | Failures since last success                |
| `last_failure_at`      | `timestamptz`                            | Timestamp of most recent failure           |
| `last_failure_reason`  | `text`                                   | Error message from last failure            |
| `last_success_at`      | `timestamptz`                            | Timestamp of most recent success           |
| `disabled_by`          | `text`                                   | `"auto"` or user identifier                |
| `disabled_at`          | `timestamptz`                            | When provider was disabled                 |
| `auto_disabled`        | `boolean`                                | `true` if auto-disabled by threshold       |
| `auto_recovery_at`     | `timestamptz`                            | Scheduled recovery time (maintenance mode) |

### Database Schema — `provider_health_log` table

| Column       | Type    | Description                                                                         |
| ------------ | ------- | ----------------------------------------------------------------------------------- |
| `provider`   | `text`  | Provider name                                                                       |
| `event_type` | `text`  | `failure\|recovery\|disabled\|enabled\|paused\|resumed\|maintenance\|warning\|info` |
| `severity`   | `text`  | `critical\|warning\|info`                                                           |
| `message`    | `text`  | Human-readable description                                                          |
| `details`    | `jsonb` | Arbitrary structured data                                                           |

### Control API (api/\_lib/provider-controls.ts)

**Read Operations:**

- `getProviderControls()` — Returns all 5 provider control rows.
- `getProviderControl(provider)` — Returns single control or `null`.
- `isProviderEnabled(provider)` — Returns `true` if status is `"enabled"`.
- `isProviderAvailable(provider)` — Returns `true` if status is `"enabled"`, or if status is `"maintenance"` with a future `auto_recovery_at`.
- `getHealthLog(provider?, limit?)` — Returns health events, optionally filtered by provider.

**Mutations:**

- `setProviderStatus(provider, status, by?)` — Sets status, clears `consecutive_failures` on enable, sets `disabled_by`/`disabled_at` on disable, logs health event.
- `recordProviderSuccess(provider)` — Resets `consecutive_failures` to 0, sets `last_success_at`.
- `recordProviderFailure(provider, reason, autoDisableThreshold = 3)` — Increments counters. If `consecutive_failures >= autoDisableThreshold`, auto-disables the provider (sets status to `"disabled"`, `disabled_by` to `"auto"`, logs critical event).

**Bulk Operations:**

- `enableAllProviders()` — Sets all 5 providers to `"enabled"`.
- `disableAllProviders()` — Sets all 5 providers to `"disabled"`.

### Auto-disable Flow

1. A `recordProviderFailure` call increments `consecutive_failures`.
2. When `consecutive_failures >= autoDisableThreshold` (default 3), the provider is automatically set to `"disabled"` with `auto_disabled = true`.
3. A critical health event is logged with severity `"critical"` and event_type `"disabled"`.
4. The batch apply engine checks `isProviderEnabled` before including jobs from that provider.
5. Manual re-enable is required (via `setProviderStatus(provider, "enabled")` or Telegram `/provider-enable`).

## 4. Cookie Refresh Workflow

### Script: `scripts/refresh-cookies.ts`

**Step-by-step:**

1. Launches Edge (Chromium) in headless mode using `launchPersistentContext` against **Edge Profile 3** at `%LOCALAPPDATA%\Microsoft\Edge\User Data\Profile 3`.
2. Reads all cookies from the browser context without navigation.
3. For each provider, filters cookies by domain (`linkedin.com`, `indeed.com`, `naukri.com`, `wellfound.com`, `instahyre.com`) and extracts key cookies listed in `AUTH_PROVIDERS`.
4. Assembles cookie strings as `name=value; name=value; ...` for each provider.
5. Updates `.env` — replaces or appends `{PROVIDER}_COOKIE` lines with escaped cookie strings.
6. Closes the browser context and relaunches Edge.

**Key Cookies per Provider:**

- LinkedIn: `li_at`
- Indeed: `__Secure-PassportAuthProxy-BearerToken`, `CTK`
- Naukri: `nauk_sid`, `nauk_cs`
- Wellfound: `_wellfound`, `remember_token`
- Instahyre: `sessionid`

**Prerequisites:**

- Edge must be signed into all 5 provider accounts in Profile 3.
- Edge must be fully closed before running (Edge lock file released).
- Run via: `npx tsx scripts/refresh-cookies.ts`

## 5. Batch Application Pipeline

### Strategy-driven Batch Apply Engine (`api/_lib/batch-apply-engine.ts`)

### Three Strategies

| Strategy       | Tiers   | Easy Apply | Freshness | Approval   | Min Score |
| -------------- | ------- | ---------- | --------- | ---------- | --------- |
| `conservative` | A only  | Required   | ≤3d       | Always on  | 85        |
| `balanced`     | A, B    | Preferred  | ≤7d       | Default on | 70        |
| `aggressive`   | A, B, C | Any        | ≤30d      | Optional   | 50        |

### Pipeline Steps

**Phase 1 — Resolve Eligible Jobs:**

1. Fetch user's jobs from `jobs` table where `status = "open"`.
2. Exclude jobs that already have an application in `applications` table for this user.
3. Filter by enabled providers (checked via `isProviderEnabled`).
4. Apply user-supplied `BatchFilters` — `minScore`, `tier`, `source`, `workMode`, `freshness`, `easyApplyOnly`, `companySize`.
5. Apply strategy thresholds — tier, score, easy-apply, freshness constraints.
6. Return eligible jobs sorted by `match_score` descending, capped at 200.

**Phase 2 — Filtering (within resolveEligibleJobs):**

- Only jobs from enabled providers are considered.
- Strategy tier whitelist: conservative (A), balanced (A+B), aggressive (A+B+C).
- Minimum match score: conservative 85, balanced 70, aggressive 50.
- Easy-apply only enforced for conservative; preferred but not required for balanced.
- Freshness bucket must match strategy's allowed buckets.
- Tier overrides via `filters.tier`.

**Phase 3 — Build Application Package:**
Each eligible job goes through `buildApplicationPackage()` which creates a structured application payload including resume, cover letter (if available), and parsed profile data.

**Phase 4 — Submit via Apply Engine:**
`submitApplication()` dispatches to the single Apply Engine (A7) which enforces the "primary resume only" rule uniformly. Each submission creates a `batch_apply_items` record tracking status.

### Approval Mode

- If `approvalMode` is `true` (default for conservative and balanced), jobs are inserted into `batch_apply_items` with status `"pending"` and a Telegram notification is sent via `notifyBatchApplyApproval`.
- The batch run status is set to `"queued"` — execution waits for user approval.
- Users approve/reject individual items via Telegram inline buttons.
- Once approved, `executeBatch()` is called to submit.

### Direct Execution Mode

- If `approvalMode` is `false` (aggressive default), the batch runs immediately without waiting.
- Creates application rows, builds packages, submits each job sequentially.
- Tracks `submitted`, `skipped`, `failed` counts.
- Updates batch run as `"completed"` or `"failed"` when all jobs are processed.
- Emits workflow event `batch_apply_completed`.

## 6. Validation Suite

### Script: `scripts/validate-provider-controls.ts`

Runs ~80 tests across multiple phases:

**Phase 1 — Provider Control Center (1.1–1.6)**

- Read all 5 provider controls.
- Verify each provider (linkedin, indeed, naukri, wellfound, instahyre) is present.
- Check initial status defaults.
- Test `getProviderControl` for existing and missing providers.
- Test `isProviderEnabled` and `isProviderAvailable`.

**Phase 2 — Status Mutations**

- Disable/enable individual providers.
- Verify metadata — `disabled_by`, `disabled_at`, `auto_disabled`, `consecutive_failures` clearing.
- Test pause and resume.

**Phase 3 — Failure Tracking**

- Record failures and verify counter increments.
- Verify auto-disable after threshold (3 consecutive failures).
- Verify health events are logged with correct severity.

**Phase 4 — Health Log**

- Verify `getHealthLog` returns events.
- Verify filtering by provider.
- Verify event structure.

**Phase 6 — Bulk Operations**

- `enableAllProviders` — all 5 set to enabled.
- `disableAllProviders` — all 5 set to disabled.

**Phase 7 — Integration with Other Systems**

- Resume extraction (from a local PDF file, e.g., `~/Downloads/Resume.pdf`).
- Alert building via `buildAlertText`.
- Retry operation via `retryOperation`.

Run with: `npx tsx scripts/validate-provider-controls.ts`

## 7. Status Monitoring via Telegram

### Commands

| Command                    | Action                                                      |
| -------------------------- | ----------------------------------------------------------- |
| `/provider-status`         | Lists all providers with status, failure counts, last error |
| `/provider-enable <name>`  | Enables a disabled provider                                 |
| `/provider-disable <name>` | Disables a provider                                         |
| `/provider-pause <name>`   | Pauses a provider                                           |
| `/provider-log <name>`     | Shows recent health events for a provider                   |

### Alerting

- Auto-disable triggers a critical alert via `buildAlertText` which formats provider health events into Telegram messages.
- Approval-mode batch notifications use `notifyBatchApplyApproval` to send inline buttons for accept/reject.

## 8. Recovery Procedures

### Expired Cookies

**Symptom:** Repeated failures (importJobs returns empty or auth errors).
**Recovery:**

1. Open Edge Profile 3, sign into the affected provider.
2. Close Edge completely.
3. Run `npx tsx scripts/refresh-cookies.ts` to extract fresh cookies.
4. Verify with `/provider-status` and run validation.

### Provider Auto-disabled

**Symptom:** Provider shows as disabled with `auto_disabled: true`.
**Recovery:**

1. Check `provider_health_log` for the failure reason.
2. Resolve the root cause (cookie expiry, rate limiting, provider outage).
3. Re-enable via Telegram `/provider-enable <name>` or API `setProviderStatus(provider, "enabled")`.
4. Run a small batch test to confirm recovery.

### Maintenance Mode

**Symptom:** Provider unavailable during planned maintenance.
**Action:**

1. Set provider to `"maintenance"` status with `auto_recovery_at`.
2. `isProviderAvailable` will return `true` only if current time is before `auto_recovery_at`.
3. System auto-recovers when maintenance window passes (checked at runtime).

### ATS Board Token Issues

**Symptom:** Greenhouse/Lever/Ashby jobs return READY_FOR_CREDENTIALS.
**Recovery:**

- Verify board token/URL/subdomain in the integration config.
- Check the company's career page is publicly accessible.
- For Workable, verify the subdomain or board URL resolves.

### Rate Limiting

**Symptom:** Consecutive failures with HTTP 429 or similar.
**Recovery:**

1. The self-healing module (`retryOperation` in `api/_lib/self-healing.ts`) applies exponential backoff.
2. If failures persist past threshold, provider auto-disables.
3. Wait for rate-limit window to expire, then re-enable.
