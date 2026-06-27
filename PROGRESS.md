## Goal
- Deliver v1.0.0 by completing all 45+ verified fixes — then freeze for production deployment.

## Constraints & Preferences
- No new features, no refactoring for its own sake, no placeholders, no mocked execution
- Never fabricate data — recruiters, contacts, emails, phone numbers, titles, pain points, LinkedIn URLs must all come from verified public sources only; store "Not Found" when unverifiable
- Unknown questions during application pause only that application via Telegram, never the entire workflow
- Role-specific questions ("why this company", "cover letter", etc.) MUST get fresh AI answers via `shouldAlwaysRegenerate`; never reuse cached
- Edge Stable auto-detect on Windows via `EDGE_PATH` env var; graceful fallback to bundled Chromium; on Vercel return `unavailable`
- Cookies exclusively through Settings UI → encrypt (AES-256-GCM) → `provider_cookies` DB → decrypt → Playwright runtime; never unencrypted in `integrations.config`
- Candidate Brain is single source of truth (tables: `skills`, `projects`, `education`, `experiences`, `certifications`)
- Full multi-user isolation on every query — every `.from("...")` must include `.eq("user_id", userId)`
- All commands use `npm.cmd` / `npx.cmd`
- When manual intervention required, stop and explain exactly what the user must do

## Done
- **Multi-user isolation**: 21 queries across 6 files (`provider-controls.ts`, `outreach-sender.ts`, `notification-center.ts`, `queue.ts`, `workflow-runner.ts`) lacked `user_id` filters — all fixed. Every function now accepts `userId` param and filters by `.eq("user_id", userId)`. All callers updated.
- **Provider pipeline 5 critical bugs**:
  1. `notifyUnknownQuestion` never called from `handleScreeningQuestions` — now wired in with AI-generated suggestion, pauses only that application
  2. `shouldAlwaysRegenerate` never checked in fill pipeline — now calls `generateDynamicAnswer` with company/job context for role-specific questions
  3. `generateDynamicAnswer` never called from apply pipeline — now wired via `fillKnownFields` with optional `jobContext` param
  4. No "already applied" pre-check for Naukri/Wellfound/Instahyre — added `detectConfirmation()` before Apply button click
  5. `detectConfirmation` only checked English text — now multilingual (Chinese, Japanese, Spanish, French) + DOM element checks
- **`WorkflowStatus` "error" state added**: union type now includes `"error"`; phase failures set `status: "error"` instead of `"running"`
- **Cookie security**: Settings page no longer stores cookies unencrypted in `integrations.config` — cookie fields removed from provider definitions, saved through `/api/cookies/set` encrypted endpoint. `hydrateSource` checks encrypted `getCookie()` from `provider_cookies` FIRST, then falls back to config
- **Resume intelligence 4 fixes**:
  1. AI system prompt now has detailed anti-misclassification guardrails
  2. `replaceUserRows` now uses `upsert` with `onConflict: "user_id,name"` for skills — preserves user-added notes/modifications
  3. Preferred roles removed from `buildSkillRows`
  4. New `skillToRegex()` helper with word-boundary matching for dotted skills like `Next.js`
  5. `normalizeDate()` helper added for education/experience date fields
- **Error handling**: Duplicate outreach prevention; 13 silent catch blocks in `playwright-apply.ts` fixed with `console.warn`; `runAutoMigration().catch(() => {})` now logs error; orphan record TODO noted
- **Database schema**:
  - `provider_cookies`: `GRANT ALL ON public.provider_cookies TO service_role, authenticated, anon` applied
  - `resume_versions`: `parse_result` (jsonb) and `confidence_score` (real) columns added
  - `skills`: unique constraint `skills_user_name_unique(user_id, name)` added
- **Edge auto-detection**: `detectEdgePath()` checks `EDGE_PATH` env var, 3 Windows install paths, registry query; Vercel returns `unavailable`; `require("child_process")` replaced with ES import
- **Type errors**: 4 `implicit any` catches, 1 `require` call — all resolved
- **Settings UI**: Remove Cookie button has confirmation dialog
- **Resume pipeline live-verified**: Resume1.pdf (Digvijay Kumar Singh) → storage → text extraction → AI parse → DB save → candidate brain sync — **full end-to-end verified**. 39 skills (no misclassifications), 3 projects, 1 education with date normalization, 0 experience (honest), 0 certifications (honest)
- **Skills table cleaned**: 4 `preferred_roles` + 4 role-like entries removed; 39 genuine technology skills remain

### Blocked (user action required)
- **Vercel deploy**: Import repo into Vercel dashboard, set all 30+ env vars from `.env`
- **Telegram webhook**: `curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<VERCEL_URL>/api/workflow/cycle"`
- **Google OAuth redirect URI**: Add `https://<VERCEL_URL>/api/auth/gmail/callback` to Google Cloud Console
- **Real provider cookies**: Paste LinkedIn/Indeed/Naukri/Wellfound cookies via Settings UI after deployment
- **Workflow execution**: Visit `/api/precheck/workflow` then trigger via Telegram `/start`

## Key Decisions
- **Skills table column is `name`** (not `skill_name`). Upsert conflict is on `user_id, name`
- **Candidate brain uses flat table names** (`skills`, `projects`, `education`, `experiences`, `certifications`). No `candidate_brain_*` prefix. All 5 tables exist with data
- **Date normalization**: "Expected June 2026" → `2026-06-01`. Null dates → `null`. Handles ISO, Month Year, and "Expected" formats
- **Role-specific questions forced fresh**: `shouldAlwaysRegenerate` checked before every field fill; if true, `generateDynamicAnswer` called with company + job context
- **Unknown questions pause one application**: `notifyUnknownQuestion` sends Telegram notification; only that application waits for user response
- **`provider_cookies` GRANT** must be in migration file for fresh deployments

## Relevant Files
- `api/_lib/provider-controls.ts`: All 10 functions now accept `userId` — fixes multi-user isolation
- `api/_lib/outreach-sender.ts`: `sendOutreachMessage()` adds `.eq("user_id", userId)` to all queries
- `api/_lib/notification-center.ts`: `markRead()` adds `.eq("user_id", userId)`
- `api/_lib/queue.ts`: `updateQueueJobStatus()` adds `.eq("user_id", userId)`
- `api/_lib/playwright-apply.ts`: `handleScreeningQuestions` → `notifyUnknownQuestion`; `fillKnownFields` checks `shouldAlwaysRegenerate`; Naukri/Wellfound/Instahyre "already applied" pre-check; multilingual `detectConfirmation`; 13 silent catches fixed
- `api/_lib/dynamic-profile-memory.ts`: `shouldAlwaysRegenerate` patterns checked before field fill
- `api/_lib/workflow-state.ts`: `WorkflowStatus` includes `"error"`
- `api/_lib/workflow-runner.ts`: Phase failures set `status: "error"`; `getEnabledProviders()` filters by userId
- `api/_lib/job-resolver.ts`: `hydrateSource` checks encrypted `getCookie()` first, then unencrypted config
- `api/_lib/candidate-brain.ts`: `syncResumeToBrain` normalizes array fields with `??= []`; `replaceUserRows` uses upsert with `conflictColumn: "name"` for skills; preferred roles removed from `buildSkillRows`; `normalizeDate()` helper for date columns; error logging in fallback inserts
- `api/_lib/resume-parser.ts`: AI system prompt with anti-misclassification guardrails; `skillToRegex()` for multi-word/dotted skills; date parser handles 6 formats
- `api/_lib/crypto-utils.ts`: AES-256-GCM encrypt/decrypt (unchanged)
- `api/_lib/provider-cookies.ts`: `getCookie` decrypts; `setCookie` encrypts+upserts; `validateCookie` does real HTTP request
- `api/_lib/cookie-manager.ts`: All functions accept userId; `refreshProviderCookie` validates immediately after setting
- `api/_lib/playwright-platform.ts`: `detectEdgePath()` auto-detects Edge; `launchAuthenticatedContext` returns `unavailable` on Vercel
- `api/_lib/outreach-engine.ts`: Duplicate draft check before insert
- `api/[...route].ts`: `runAutoMigration().catch()` now logs errors; `handleCookiesSet` calls encrypted save
- `src/routes/_authenticated/settings.tsx`: Cookie fields removed from LinkedIn/Wellfound/Naukri; Remove Cookie has confirmation dialog
- `src/routes/_authenticated/cookies.tsx`: Full cookie management UI (unchanged)
- `supabase/migrations/20260626000002_provider_cookies.sql`: Needs `GRANT ALL ON public.provider_cookies TO service_role` added
- `tests/parse-and-sync.ts`: Verification script for the full resume upload → parse → sync pipeline
- `tests/verify-full-state.ts`: Database state verification script

## Next Steps
1. **User**: `npm.cmd run build` — verify 0 lint errors, 0 type errors
2. **User**: Deploy to Vercel — import repo, set 30+ env vars, deploy
3. **User**: Register Telegram webhook
4. **User**: Add Google OAuth redirect URI
5. **User**: Paste provider cookies via Settings UI
6. **User**: Run `/api/precheck/workflow` — all 10 checks green
7. **User**: Trigger workflow via Telegram `/start`
8. Tag `v1.0.0` after production smoke test

## Database
- **Supabase project**: `ubpjhunogqddyatqdjva`
- **Primary user**: `e178c157-318a-4a41-8aea-b964fff877f8` (Digvijay Kumar Singh)
- **16 tables with data** — all confirmed existing and populated
- **Resume1.pdf**: 39 skills, 3 projects, 1 education (MCA), 0 experience, 0 certifications — all correctly classified
- **Edge browser**: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
- **Dev server**: port 5173 (port 8080 reserved — do not touch)
