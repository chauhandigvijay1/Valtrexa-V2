# Provider Failure Registry

Tracking known issues, failure patterns, detection logic, recovery steps, and fallback strategies for each supported job provider in VALTREXA-V2.

---

## LinkedIn

### Status: ⚠️ Limited (Headless auth blocked)

| Challenge           | Frequency              | Detection                                | Mitigation                              |
| ------------------- | ---------------------- | ---------------------------------------- | --------------------------------------- |
| Cookie expiry       | ~30 days               | Session redirect, 401 API errors         | `scripts/refresh-cookies.ts`            |
| Anti-bot detection  | Every headless session | Block page, "unusual traffic" message    | Must use real Edge Profile 3            |
| Account restriction | Rare                   | "Account restricted" page, email warning | Manual review, 24-48h cooldown          |
| Easy Apply changes  | Quarterly              | Button not found, modal layout changed   | Update selectors, test in approval mode |
| Rate limiting       | Daily                  | "Too fast" message, CAPTCHA              | Max 50 applications/day, random delays  |
| Session expiry      | Weekly                 | Redirect to login page                   | Re-authenticate via real Edge           |

### Known Limitations

- **Headless Playwright login is impossible** — LinkedIn's anti-bot blocks all automated browser connections
- **Cookies extracted from real Edge work** but must be refreshed before each session
- **Mass application triggers account restriction** — use approval mode only
- **Easy Apply modal changes without notice** — selector updates needed periodically

### Recovery

1. Open Edge Profile 3 → Sign in to LinkedIn
2. Run `npx tsx scripts/refresh-cookies.ts`
3. Verify session: `/provider-status`
4. If restricted: wait 24-48h, then repeat

### Detailed Failure Patterns

#### Cookie Expiry

- **Symptoms**: 401/redirect to login page; API calls return auth errors; `/login` or `sign in` text detected on job pages
- **Detection Logic**: Check URL contains `/login` or `/auth`; check page text for "session expired" or "sign in"; detect missing profile elements
- **Recovery Steps**: 1. Run `scripts/refresh-cookies.ts` (kills Edge, extracts cookies from Profile 3, relaunches) 2. Or manually sign in via Edge Profile 3 3. Verify with `/provider-status`
- **Fallback Strategy**: Maintain 2+ cookie backups; auto-disable after 1 failure (critical); notify via Telegram

#### Account Restriction

- **Symptoms**: "We've detected unusual activity" page; "Account restricted" message; no search results; LinkedIn sends warning email
- **Detection Logic**: Check page HTML for "restricted", "unusual activity", "limited account"; detect missing profile header
- **Recovery Steps**: 1. Stop all LinkedIn operations immediately 2. Sign in manually via real browser 3. Complete any verification steps 4. Wait 24-48 hours before resuming 5. Re-enable with `/provider-enable linkedin`
- **Fallback Strategy**: Respect LinkedIn's rate limits; max 50 applications/day; spread across 8+ hours; use approval mode for Easy Apply

#### Easy Apply Changes

- **Symptoms**: "Easy Apply" button not found; different modal layout; new fields in application form; submission fails silently
- **Detection Logic**: Button selector `button[aria-label*="Easy Apply"]` not found; modal selector `.jobs-easy-apply-modal` not found; form fields mismatch
- **Recovery Steps**: 1. Capture screenshot and HTML diff 2. Update selectors in provider config 3. Test with single application in approval mode 4. Roll out to all applications
- **Fallback Strategy**: Fall back to manual apply instructions; use backup selectors with aria-label matching; fuzzy text matching for buttons

#### Anti-Bot Detection

- **Symptoms**: "You're visiting too fast" message; CAPTCHA challenge; LinkedIn blocks the session; "Please verify you're a human" page
- **Detection Logic**: CAPTCHA patterns in HTML; `challenge-platform` iframe; `cf-turnstile` widget; rate limit page text
- **Recovery Steps**: 1. Stop all LinkedIn operations 2. Wait 1+ hour 3. Re-authenticate via Edge Profile 3 4. Reduce operation frequency 5. Add random delays between actions
- **Fallback Strategy**: Use real Edge browser profile (not headless) for all LinkedIn operations; maximum 5 actions per session; 10-30 second random delays

---

## Indeed

### Status: ⚠️ Limited (Headless auth blocked)

| Challenge              | Frequency    | Detection                                       | Mitigation                            |
| ---------------------- | ------------ | ----------------------------------------------- | ------------------------------------- |
| JWT token expiry       | ~7 days      | 401 on API calls                                | `scripts/refresh-cookies.ts`          |
| Layout changes         | Monthly      | Selectors return null                           | Update scrape config, test single job |
| Anti-bot detection     | Intermittent | Block page, CAPTCHA                             | Real Edge profile, longer delays      |
| Apply button missing   | Common       | "Apply on company site" instead of Indeed apply | Skip job or note as external          |
| Form structure changes | Quarterly    | Fields not found, different step count          | Update form handlers                  |

### Known Limitations

- **Indeed increasingly redirects to external career sites** — many "Easy Apply" jobs are actually external
- **JWT token format changed in 2025** — cookie extraction was updated
- **Indeed blocks automated traffic aggressively in some regions**

### Recovery

1. Refresh cookies from Edge Profile 3
2. Check for layout changes by inspecting Indeed's current DOM
3. Update selectors in provider configuration
4. Test with approval mode

### Detailed Failure Patterns

#### Layout Changes

- **Symptoms**: Application form has different structure; "Apply on company site" appears unexpectedly; "Questions" section changed
- **Detection Logic**: Familiar selectors return empty/null; form fields not as expected; different number of form steps
- **Recovery Steps**: 1. Open Indeed in real browser and inspect the new layout 2. Update selectors in provider config 3. Test with approval mode 4. Capture evidence of old vs new layout
- **Fallback Strategy**: Use generic form field detection ("input", "select", "textarea"); text-matching for labels; aria-label fallback

#### Selector Changes

- **Symptoms**: Buttons not clickable; fields not fillable; submit fails; "Next" button not found
- **Detection Logic**: Selector failures logged; `missing_button` failure type triggered
- **Recovery Steps**: 1. Check PROVIDER_FAILURE_REGISTRY.md for known changes 2. Inspect Indeed's current DOM 3. Update selectors 4. Run validation test
- **Fallback Strategy**: Multi-selector fallback chain; text matching; aria-label matching; fuzzy matching for Japanese/special characters

---

## Naukri

### Status: ✅ Full Support

| Challenge             | Frequency  | Detection                     | Mitigation                         |
| --------------------- | ---------- | ----------------------------- | ---------------------------------- |
| CAPTCHA on login      | Every ~24h | reCAPTCHA iframe detected     | Manual solve, then extract cookies |
| Session expiry        | ~24 hours  | Redirect to login             | Re-authenticate via Edge           |
| Search results change | Monthly    | Job card selectors fail       | Update scrape config               |
| CAPTCHA on apply      | Occasional | reCAPTCHA in application form | Retry with delay, or skip job      |

### Known Limitations

- **CAPTCHA appears daily** — cannot be auto-solved. Session lasts ~24h after manual solve
- **CAPTCHA sometimes appears during application** — not just login
- **Some applications require OTP verification** — must skip these jobs

### Recovery

1. If CAPTCHA: solve manually in real browser, then refresh cookies
2. If session expired: re-authenticate, run `refresh-cookies.ts`
3. If application CAPTCHA: skip job, continue to next

### Detailed Failure Patterns

#### CAPTCHA

- **Symptoms**: CAPTCHA widget appears on login or search pages; "Enter the characters" prompt; reCAPTCHA iframe detected
- **Detection Logic**: CAPTCHA patterns in page HTML or iframes; `g-recaptcha` class; reCAPTCHA iframe URL patterns
- **Recovery Steps**: 1. CAPTCHA cannot be auto-solved 2. Prompt Telegram admin for manual solving 3. After solving, session remains valid for ~24h 4. Automate cookie extraction after manual solve
- **Fallback Strategy**: Schedule operations during low-CAPTCHA periods; rotate IP if CAPTCHA frequency is high; auto-disable after 3 CAPTCHA detections

#### Login/Session Expiry

- **Symptoms**: Redirected to login page; "Your session has expired" message; profile page shows login form
- **Detection Logic**: URL changes to `/login`; session expired text detected; profile element missing
- **Recovery Steps**: 1. Re-authenticate via Edge Profile 3 2. Run `refresh-cookies.ts` 3. Verify with `/provider-status`
- **Fallback Strategy**: Check session before each operation batch; auto-refresh cookies if session detected as expired

---

## Wellfound (AngelList)

### Status: ⚠️ Limited (Headless auth blocked)

| Challenge          | Frequency              | Detection                  | Mitigation                   |
| ------------------ | ---------------------- | -------------------------- | ---------------------------- |
| Session expiry     | ~7 days                | Redirect to login          | Re-authenticate via Edge     |
| Anti-bot detection | Every headless session | Block page                 | Must use real Edge Profile 3 |
| Selector changes   | Monthly                | Buttons not found          | Update selectors             |
| Apply flow changes | Quarterly              | Steps differ from expected | Update application handler   |

### Known Limitations

- **Wellfound detects Playwright** — headless browser connections are blocked
- **Real Edge Profile 3 is required** for all Wellfound operations
- **Wellfound sessions last ~7 days** — weekly refresh needed

### Recovery

1. Sign in via Edge Profile 3
2. Extract cookies: `npx tsx scripts/refresh-cookies.ts`
3. Verify: `/provider-status`
4. Schedule weekly cookie refresh

### Detailed Failure Patterns

#### Session Expiry

- **Symptoms**: Redirected to login; "Sign in" page shown; "Your session expired" toast notification
- **Detection Logic**: URL contains `auth` or `login`; "Sign in" button present; "session expired" text
- **Recovery Steps**: 1. Sign in via Edge Profile 3 2. Extract fresh cookies with `refresh-cookies.ts` 3. Verify
- **Fallback Strategy**: Pre-operation session check; cookie TTL is ~7 days; schedule weekly refresh

#### Selector Changes

- **Symptoms**: Buttons missing or renamed; "Apply" button not found; application form changed
- **Detection Logic**: Playwright selectors return null; `selector_failure` or `missing_button` events
- **Recovery Steps**: 1. Inspect UI changes 2. Update selectors 3. Test single application 4. Deploy config change
- **Fallback Strategy**: Multi-selector fallback; text matching by role ("Apply for this job", "Apply"); aria-label fallback

---

## Instahyre

### Status: ✅ Full Support (with caveats)

| Challenge         | Frequency   | Detection          | Mitigation                 |
| ----------------- | ----------- | ------------------ | -------------------------- |
| Session expiry    | ~7 days     | Redirect to login  | Re-authenticate via Edge   |
| CSRF token expiry | Per session | 403 on form submit | Extract fresh csrftoken    |
| Site redesign     | Rare        | All selectors fail | Full scrape config rewrite |
| CAPTCHA           | Rare        | reCAPTCHA detected | Manual solve session       |

### Known Limitations

- **Instahyre works in headless Playwright** — one of two providers that do
- **CSRF token must be extracted per session** — included in cookie extraction
- **Some jobs redirect to external sites** — needs fallback handling

### Recovery

1. Re-authenticate if session expired
2. Run cookie refresh for new CSRF token
3. If site redesign: full config update

### Detailed Failure Patterns

#### Site Redesign

- **Symptoms**: Page structure completely different; familiar selectors all fail; application flow changed
- **Detection Logic**: All primary and backup selectors fail; layout appears significantly different from baseline
- **Recovery Steps**: 1. Open Instahyre in real browser 2. Map new structure 3. Update all selectors 4. Run full validation 5. Update this registry
- **Fallback Strategy**: Minimum viable selectors (generic); fallback to manual instructions; alert admin for full redesign

#### Selector Changes

- **Symptoms**: Minor UI updates break specific selectors; button text changed; field IDs updated
- **Detection Logic**: Specific selectors fail while others work; consistent pattern of failures for a provider
- **Recovery Steps**: 1. Identify changed elements 2. Update selectors in provider config 3. Test
- **Fallback Strategy**: Fallback chain (3+ selectors); aria-label; text matching; fuzzy matching

---

## ATS Providers (Greenhouse, Lever, Ashby, Workable)

### Status: ✅ Full Support (API-based)

| Challenge         | Frequency        | Detection        | Mitigation             |
| ----------------- | ---------------- | ---------------- | ---------------------- |
| API rate limiting | Rare             | 429 responses    | Backoff and retry      |
| API changes       | Rare (quarterly) | Parsing failures | Update import handlers |
| Board URL changes | Per company      | No jobs returned | Update company config  |

### Recovery

1. Check API response format
2. Update import parser if API changed
3. Retry with backoff on rate limits

---

## General Pipeline Challenges

### Redis Down

- **Detection**: BullMQ connection errors
- **Mitigation**: Inline fallback executes operations directly
- **Recovery**: Restart Redis, queues reconnect automatically

### Telegram notifications not arriving

- **Detection**: Messages not received on Telegram
- **Mitigation**: Check TELEGRAM_BOT_TOKEN and bot webhook registration
- **Recovery**: Restart the application to re-register the webhook

### Telegram Down

- **Detection**: API returns error
- **Mitigation**: Alerts are logged to DB silently
- **Recovery**: Telegram API recovers automatically

### Gmail Down / OAuth Expired

- **Detection**: 401 from Gmail API
- **Mitigation**: Email operations skip, logged to health log
- **Recovery**: Re-authenticate via OAuth consent screen

---

## Self-Healing System

The system proactively handles UI drift and transient failures before surfacing alerts.

### Fallback Selector Strategy

When a selector fails to find an element, the system tries progressively less specific strategies:

1. **Primary selector** — the exact CSS/XPath selector from provider config
2. **Fallback selectors** — alternative selectors stored in provider config
3. **Text matching** — search for visible text content matching the target
4. **Aria-label matching** — search for elements by `aria-label` attribute
5. **Fuzzy matching** — case-insensitive, substring, and partial matches for button/input text

**Implementation**: `findElementWithFallback()`, `clickWithFallback()`, `fillWithFallback()`, `waitWithFallback()` in `api/_lib/self-healing.ts`

- **Recovery**: The fallback chain resolves most minor UI changes automatically. If all strategies fail, a selector failure event is logged and auto-disables the provider after 3 failures.

### Retry Wrappers

Transient failures are automatically retried with exponential backoff:

| Function            | Retries                  | Use Case           |
| ------------------- | ------------------------ | ------------------ |
| `retryOperation()`  | Configurable (default 3) | Generic operations |
| `retryNavigation()` | 3                        | Page navigation    |
| `retryUpload()`     | 3                        | File uploads       |
| `retryClick()`      | 3                        | Button clicks      |

- **Backoff**: Base delay × 2^attempt (jittered), max 30s
- **Detection**: Network errors, timeout errors, element stale errors
- **Recovery**: Most transient failures resolve within 3 retries. On exhaustion, logs the final error to the health log.

### Auto-Heal Navigation

When the system detects a failure mode during a session, it attempts automatic recovery:

1. **Login redirect detected** → Re-navigate to the target URL, wait for page load
2. **Cookie/session expired** → Re-navigate to force cookie re-validation, wait
3. **CAPTCHA/anti-bot detected** → Navigate away and back, add delays
4. **Provider downtime (502/503)** → Delay 30s, retry navigation
5. **Selector not found** → Apply fallback chain, then fuzzy/aria matching

**Implementation**: `autoHeal()` in `api/_lib/self-healing.ts`

- **Recovery**: If auto-heal succeeds, the operation continues without alerting. If it fails after all strategies, the failure is recorded and the provider is auto-disabled after the configured consecutive failure threshold (default 3 for non-critical failures, 1 for critical).
