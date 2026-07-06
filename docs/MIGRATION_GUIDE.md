<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/favicon.svg">
    <img src="assets/favicon.svg" alt="Valtrexa V2" width="64" height="64">
  </picture>
</p>

<h1 align="center">Migration Guide — VALTREXA-V2</h1>

<p align="center">
  <strong>Version:</strong> v1.0.1 &nbsp;•&nbsp;
  <strong>Last Updated:</strong> 2026-07-05 &nbsp;•&nbsp;
  <strong>Category:</strong> Operations / Migration
</p>

<p align="center">
  Step-by-step upgrade procedures between VALTREXA-V2 versions — migration steps, breaking changes, database migrations, rollback, and verification.
</p>

---

## Table of Contents

- [Overview](#overview)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Version Compatibility Matrix](#version-compatibility-matrix)
- [v1.0.0 → v1.0.1 Migration](#v100--v101-migration)
  - [Step 1: Pre-Migration Preparation](#step-1-pre-migration-preparation)
  - [Step 2: Environment Variable Changes](#step-2-environment-variable-changes)
  - [Step 3: Database Migrations](#step-3-database-migrations)
  - [Step 4: Post-Migration](#step-4-post-migration)
  - [Step 5: User Re-Binding](#step-5-user-re-binding)
  - [Step 6: Cookie Re-Configuration](#step-6-cookie-re-configuration)
- [Breaking Changes in v1.0.1](#breaking-changes-in-v101)
  - [1. Env-Var Fallback Removal](#1-env-var-fallback-removal)
  - [2. Multi-User Isolation](#2-multi-user-isolation)
  - [3. Telegram Inbound Resolution](#3-telegram-inbound-resolution)
- [Database Migration Procedures](#database-migration-procedures)
- [Rollback Procedures](#rollback-procedures)
- [Verification Steps](#verification-steps)
- [Best Practices](#best-practices)
- [Related Documents](#related-documents)

---

## Overview

This guide covers all upgrade scenarios for VALTREXA-V2. Always read the full migration section for your version pair before proceeding. Each migration includes pre-migration checks, step-by-step instructions, database migration commands, rollback procedures, and post-migration verification.

```mermaid
sequenceDiagram
    participant Admin
    participant Backup as Database Backup
    participant Staging as Staging Env
    participant Production as Production Env
    participant Users as End Users
    Admin->>Backup: 1. Create full DB backup
    Admin->>Admin: 2. Record current env vars
    Admin->>Admin: 3. Pause active workflows
    Admin->>Admin: 4. Review breaking changes
    Admin->>Staging: 5. Apply migrations to staging
    Staging-->>Admin: 6. Verify staging health
    Admin->>Production: 7. Apply migrations to production
    Production-->>Admin: 8. Run post-migration steps
    Admin->>Admin: 9. Run verification checks
    alt Breaking change requires user action
        Admin->>Users: 10. Notify users to rebind Telegram / reconfigure cookies
        Users-->>Admin: 11. Confirm re-binding complete
    end
    Admin->>Admin: 12. Mark migration complete
```

> [!IMPORTANT]
> Always back up your database before applying migrations. Test migrations in a staging environment before applying to production.

---

## Pre-Migration Checklist

- [ ] Back up your Supabase database
- [ ] Record current environment variable values
- [ ] Note current workflow state (pause all active workflows)
- [ ] Verify current version via changelog
- [ ] Review breaking changes for your target version
- [ ] Notify users if multi-user breaking changes apply
- [ ] Schedule maintenance window for production deployments

---

## Version Compatibility Matrix

| From   | To     | DB Migrations  | Breaking Changes                        | Downtime   |
| ------ | ------ | -------------- | --------------------------------------- | ---------- |
| v1.0.0 | v1.0.1 | 2 migrations   | Yes — env-var removal, multi-user isolation | ~15 minutes |

---

## v1.0.0 → v1.0.1 Migration

> [!WARNING]
> v1.0.1 introduces **multi-user isolation** and removes legacy **env-var fallback** mechanisms. This is a significant upgrade that requires careful execution, especially for single-user deployments transitioning to multi-user architecture.

### What Changed

| Area                     | v1.0.0                                      | v1.0.1                                         |
| ------------------------ | ------------------------------------------- | ---------------------------------------------- |
| Telegram user resolution | `TELEGRAM_USER_ID` env var fallback         | `telegram_bindings` table exclusively          |
| Provider cookies         | Global env var fallbacks (`LINKEDIN_COOKIE`, `INDEED_COOKIE`, etc.) | Per-user cookie storage only |
| Provider controls        | Global `provider_controls`                  | Per-user `provider_controls` with `UNIQUE(user_id, provider)` |
| Provider health          | No user isolation                           | `provider_health_log` includes `user_id` column with index |
| User isolation           | Mixed global/per-user data                  | Full multi-user isolation on all tables        |

### Step 1: Pre-Migration Preparation

```bash
# 1. Pull latest code
git fetch origin
git checkout v1.0.1  # or latest tag

# 2. Install dependencies
npm install

# 3. Back up database (via Supabase Dashboard -> Database -> Backups)
#    Or use pg_dump:
pg_dump --dbname "postgresql://postgres:password@project.supabase.co:5432/postgres" \
  --file "./backup/pre-v101-$(date +%Y%m%d).sql"
```

### Step 2: Environment Variable Changes

**Removed Variables** — Remove these from your `.env` and Vercel/Railway environment:

| Removed Variable      | Reason                                          | Replacement                            |
| --------------------- | ----------------------------------------------- | -------------------------------------- |
| `TELEGRAM_USER_ID`    | Telegram user binding now uses `telegram_bindings` table | Users bind via `/connect` command |
| `LINKEDIN_COOKIE`     | Provider cookies are per-user only              | Users paste cookies via dashboard/Telegram |
| `INDEED_COOKIE`       | Provider cookies are per-user only              | Users paste cookies via dashboard/Telegram |
| `NAUKRI_COOKIE`       | Provider cookies are per-user only              | Users paste cookies via dashboard/Telegram |
| `WELLFOUND_COOKIE`    | Provider cookies are per-user only              | Users paste cookies via dashboard/Telegram |
| `INSTAHYRE_COOKIE`    | Provider cookies are per-user only              | Users paste cookies via dashboard/Telegram |

**Updated Variables:**

| Variable             | Change                                    | Action                                      |
| -------------------- | ----------------------------------------- | ------------------------------------------- |
| `TELEGRAM_CHAT_ID`   | Now for **admin alerting only**           | Keep if you want admin alerts; not used for inbound resolution |
| `ADMIN_CHAT_ID`      | Alias for `TELEGRAM_CHAT_ID`              | No action needed                            |

### Step 3: Database Migrations

Apply the v1.0.1 migrations:

```bash
# Migration 1: Multi-user provider controls
npx supabase migration up --include-all --db-url "postgresql://postgres:password@project.supabase.co:5432/postgres"

# Or apply via Supabase SQL Editor:
# Open and run: supabase/migrations/20260628000000_provider_controls_multi_user.sql
# Open and run: supabase/migrations/20260625000003_multi_user.sql
```

**Migration 1: `20260628000000_provider_controls_multi_user.sql`**

This migration restructures `provider_controls` from global to per-user:

```sql
-- Step 1: Add user_id column
ALTER TABLE public.provider_controls ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Step 2: Migrate existing global records to admin users
UPDATE public.provider_controls SET user_id = (
  SELECT id FROM auth.users WHERE email = ANY(
    SELECT unnest(string_to_array(current_setting('app.admin_emails', true), ','))
  ) LIMIT 1
);

-- Step 3: Make user_id NOT NULL
ALTER TABLE public.provider_controls ALTER COLUMN user_id SET NOT NULL;

-- Step 4: Update unique constraint
ALTER TABLE public.provider_controls DROP CONSTRAINT IF EXISTS provider_controls_provider_key;
ALTER TABLE public.provider_controls ADD CONSTRAINT provider_controls_user_provider_key UNIQUE(user_id, provider);

-- Step 5: Enable RLS
ALTER TABLE public.provider_controls ENABLE ROW LEVEL SECURITY;

-- Step 6: Add RLS policy
CREATE POLICY "provider_controls owner all" ON public.provider_controls
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

**Migration 2: `20260625000003_multi_user.sql`**

This migration adds `user_id` to `provider_health_log`:

```sql
-- Add user_id to health log
ALTER TABLE public.provider_health_log ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Add index
CREATE INDEX IF NOT EXISTS idx_provider_health_log_user_id ON public.provider_health_log(user_id);

-- Populate existing records
UPDATE public.provider_health_log SET user_id = (
  SELECT user_id FROM public.provider_controls
  WHERE provider_controls.provider = provider_health_log.provider
  LIMIT 1
);
```

### Step 4: Post-Migration

```sql
-- Reload schema
NOTIFY pgrst, 'reload schema';

-- Verify migrations applied
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;
```

### Step 5: User Re-Binding

After migration, each user must bind their Telegram account:

1. User opens web dashboard -> Settings -> Telegram Connection
2. Clicks "Generate Token"
3. Sends `/connect <token>` to @ValtrexaV2Bot
4. System verifies token and creates binding in `telegram_bindings`

### Step 6: Cookie Re-Configuration

Each user must paste their own provider cookies:

1. Log into provider in browser
2. Extract session cookie (DevTools -> Application -> Cookies)
3. Paste in dashboard (Settings -> Cookies) or via Telegram `/refresh_cookies`

---

## Breaking Changes in v1.0.1

### 1. Env-Var Fallback Removal

**Impact:** Medium — affects deployments relying on `TELEGRAM_USER_ID` or global cookie env vars.

**Before (v1.0.0):**

```bash
TELEGRAM_USER_ID="123456789"
LINKEDIN_COOKIE="AQED..."
```

**After (v1.0.1):**

```bash
# These variables are no longer read
# Telegram resolution via telegram_bindings table
# Cookies per-user via provider_cookies table
```

**Action required:** Remove these env vars. Users must bind Telegram accounts and paste cookies individually.

### 2. Multi-User Isolation

**Impact:** High — fundamental architecture change from mixed global/per-user to fully isolated per-user data.

**Changes:**

- `provider_controls` is now per-user (`UNIQUE(user_id, provider)`)
- `provider_health_log` includes `user_id` index
- All database queries must scope to `user_id`
- No shared global state for provider management

**Action required:** Ensure service role queries include `.eq("user_id", userId)` on all provider tables.

### 3. Telegram Inbound Resolution

**Impact:** Medium — affects Telegram bot functionality if bindings not configured.

**Before (v1.0.0):**

```typescript
const userId = telegramBindings.user_id || process.env.TELEGRAM_USER_ID;
```

**After (v1.0.1):**

```typescript
const userId = await resolveUserIdFromTelegramChat(chatId);
// No fallback — throws if not bound
```

**Action required:** All users must bind via `/connect`. Admin alerts still use `TELEGRAM_CHAT_ID` / `ADMIN_CHAT_ID`.

---

## Database Migration Procedures

### Standard Migration Flow

```bash
# 1. Pull latest migrations
git pull origin main

# 2. Review migration files
ls supabase/migrations/

# 3. Apply all pending migrations
npx supabase migration up --include-all \
  --db-url "postgresql://postgres:password@project.supabase.co:5432/postgres"

# 4. Reload schema
NOTIFY pgrst, 'reload schema';

# 5. Verify
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```

### Direct SQL via Supabase Dashboard

1. Navigate to Supabase Dashboard -> SQL Editor
2. Open and run each migration `.sql` file in alphanumeric order
3. Run `NOTIFY pgrst, 'reload schema';` after all migrations
4. Verify with `SELECT * FROM supabase_migrations.schema_migrations;`

### Migration Safety

| Property     | Implementation                                                         |
| ------------ | ---------------------------------------------------------------------- |
| Idempotent   | All migrations use `IF NOT EXISTS` and `IF EXISTS` guards              |
| Atomic       | Each migration runs in a single transaction                            |
| Reversible   | Rollback scripts available for critical migrations                     |
| Tested       | Applied against staging environment before production                  |

---

## Rollback Procedures

### Full Rollback (v1.0.1 -> v1.0.0)

```bash
# 1. Restore database from backup
psql --dburl "postgresql://postgres:password@project.supabase.co:5432/postgres" \
  < "./backup/pre-v101-$(date +%Y%m%d).sql"

# 2. Restore environment variables
# Re-add removed env vars: TELEGRAM_USER_ID, LINKEDIN_COOKIE, etc.

# 3. Revert code
git checkout v1.0.0

# 4. Reinstall dependencies
npm install

# 5. Redeploy to Vercel + Railway
```

### Partial Rollback (Specific Migration)

If a specific migration causes issues:

```sql
-- Reverse migration 20260628000000_provider_controls_multi_user.sql
ALTER TABLE public.provider_controls DROP CONSTRAINT IF EXISTS provider_controls_user_provider_key;
ALTER TABLE public.provider_controls ADD CONSTRAINT provider_controls_provider_key UNIQUE(provider);
ALTER TABLE public.provider_controls DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.provider_controls DISABLE ROW LEVEL SECURITY;

-- Reverse migration 20260625000003_multi_user.sql
DROP INDEX IF EXISTS idx_provider_health_log_user_id;
ALTER TABLE public.provider_health_log DROP COLUMN IF EXISTS user_id;
```

### Rollback Verification

After rollback, verify:

```sql
-- Check schema version
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;

-- Verify provider_controls structure
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'provider_controls';

-- Verify env vars available
-- Check TELEGRAM_USER_ID resolves correctly
```

---

## Verification Steps

### Post-Migration Verification Checklist

- [ ] All users can bind Telegram via `/connect` command
- [ ] Provider controls are per-user (`/providers` shows only current user's providers)
- [ ] Provider cookies are per-user (dashboard shows only current user's cookies)
- [ ] Health logs are per-user (`/provider_history` scoped to current user)
- [ ] Old env vars (`TELEGRAM_USER_ID`, `LINKEDIN_COOKIE`, etc.) are removed
- [ ] New migration files are recorded in `schema_migrations`

### Automated Verification

```bash
# Run test suite
npm run test

# Check API health
curl https://valtrexa-v2.vercel.app/api/health

# Verify Telegram webhook
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

### Manual Verification

#### 1. Telegram Binding

```bash
# Generate token in dashboard -> Settings -> Telegram Connection
# Then:
curl -X POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "<your-chat-id>",
    "text": "/connect <your-token>"
  }'
# Expected: "Connected successfully"
```

#### 2. Provider Controls

```
Send /providers to @ValtrexaV2Bot
Expected: List of your providers with their statuses
```

#### 3. Workflow Execution

```
Send /workflow_start to @ValtrexaV2Bot
Expected: Workflow state transitions to "running"
```

#### 4. Database Verification

```sql
-- Verify provider_controls structure
SELECT user_id, provider, status FROM provider_controls LIMIT 5;

-- Verify no global records exist
SELECT * FROM provider_controls WHERE user_id IS NULL;

-- Verify health log structure
SELECT user_id, provider, status FROM provider_health_log LIMIT 5;

-- Verify migrations
SELECT * FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 5;
```

### Smoke Test Checklist

| Test                      | Expected Result                       | Status |
| ------------------------- | ------------------------------------- | ------ |
| Dashboard loads           | 200 OK, no console errors             | &nbsp; |
| Login works               | Successful redirect to dashboard      | &nbsp; |
| Telegram `/start`         | Bot responds with welcome message     | &nbsp; |
| Telegram `/connect`       | Successfully binds account            | &nbsp; |
| Telegram `/providers`     | Lists configured providers            | &nbsp; |
| Workflow starts           | State changes to `running`            | &nbsp; |
| Jobs import               | New jobs appear in dashboard          | &nbsp; |
| Match scoring             | Jobs receive scores                   | &nbsp; |
| Applications submit       | Applications created successfully     | &nbsp; |
| Notifications sent        | Telegram receives notification        | &nbsp; |

---

## Best Practices

> [!IMPORTANT]
> **Always back up the database before any migration.** Use `pg_dump` or the Supabase Dashboard backup feature. Store backups safely and label them with the pre-migration version and date.

> [!WARNING]
> **Test migrations in staging before production.** Apply all pending migration files to a staging environment that mirrors production. Run the full smoke test checklist before touching production.

> [!NOTE]
> **Pause all active workflows before migrating.** Active workflow cycles may interfere with schema changes. Use `/workflow_stop` or the admin panel to pause all workflows before starting.

- **Notify users in advance** when breaking changes affect them. v1.0.1 requires all users to rebind Telegram accounts and reconfigure provider cookies. Send advance notice with clear instructions to avoid disruption.
- **Use idempotent SQL patterns** (`IF NOT EXISTS`, `IF EXISTS`). All VALTREXA-V2 migrations use these guards, making them safe to reapply if a migration partially fails. Always follow this pattern in custom migrations.
- **Verify with the full checklist** before marking complete. Run both automated (`npm run test`, `/api/health`) and manual (Telegram commands, database queries) verification. The smoke test table covers all critical paths.
- **Document rollback procedures before starting.** Know how to reverse each migration and have the rollback SQL ready. A full database restore is the safest rollback path.

---

## Related Documents

- [Changelog](../CHANGELOG.md) — Detailed release notes for all versions
- [Environment Variables](ENVIRONMENT.md) — Updated env var reference
- [Database Schema](DATABASE.md) — Table definitions and migration details
- [Deployment Guide](DEPLOYMENT.md) — Rollback and redeployment procedures
- [Telegram Operations](TELEGRAM_OPERATIONS.md) — Multi-user binding setup
- [Provider Guide](PROVIDER_GUIDE.md) — Per-user cookie configuration
- [Security](SECURITY.md) — Multi-user isolation and RLS architecture

---

<br/>
<div align="center">
  <strong>Next Reading:</strong> <a href="TROUBLESHOOTING.md">Troubleshooting →</a>
</div>
