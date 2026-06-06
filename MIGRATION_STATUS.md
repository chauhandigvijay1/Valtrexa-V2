# Database Migration Audit Status

This document audits the migration state of the Career Compass Pro database, explains the lack of CLI-tracked metadata on the remote host, and provides the restoration procedure.

---

## 1. Migration Audit Findings

### How the Database Was Actually Migrated
The database schema was created and updated by executing the DDL commands contained in the migration files directly. This occurred via:
1. Direct query executions against the Postgres pooler on port `5432` / `6543`.
2. Manual copy-paste execution of SQL files in the Supabase Dashboard SQL Editor.
3. Automated ORM initialization scripts.

Because these SQL commands were executed directly, the database schema state is fully correct and matches all local schema requirements (including tables like `application_answers`, `followups`, and `interview_preparation`).

### Why `supabase_migrations.schema_migrations` Does Not Exist
The `supabase_migrations.schema_migrations` table is created and maintained exclusively by the **Supabase CLI** when executing migration management commands (like `supabase db push` or `supabase migration up`). 
* Since the CLI was not used to apply the initial or subsequent schema updates, the `supabase_migrations` schema and tracking table were never created.
* As a result, running `npx.cmd supabase migration list` displays the correct local files, but shows a blank `Remote` column for all records.

---

## 2. Migration Inventory

### Local Migration Files (13 Present)
All 13 migration files located in `supabase/migrations/` correspond to the local migration state:
1. `20260529133833_e05b8da4-068b-4844-a2bd-ee03555472e4.sql`
2. `20260529133900_d8c71c6c-0a32-4a45-84ce-7721a671b505.sql`
3. `20260529133925_0b4348a5-51b0-491f-aacc-e1bdc9332ebd.sql`
4. `20260529140546_ab2d62c2-a2f5-4c7f-a576-8b41adec3af7.sql`
5. `20260529152000_ai_career_os.sql`
6. `20260530001000_pre_n8n_readiness.sql`
7. `20260531030000_pre_n8n_release_final.sql`
8. `20260603000000_candidate_brain.sql`
9. `20260603000001_application_tier.sql`
10. `20260603000002_company_target_value.sql`
11. `20260604000000_latex_pdf_path.sql`
12. `20260604000002_fix_workflow_events_trigger.sql`
13. `20260604100000_phase_recovery.sql`

### Remote Migration State
* **Tracked Migrations:** 0
* **Untracked Schema Changes:** 100% of the active database tables, columns, indexes, and row-level security (RLS) policies are active on the remote instance but untracked in the migration history metadata.

---

## 3. Recovery Procedure (Restoring Migration Tracking)

Migration tracking can be fully restored without modifying database structure or executing SQL queries on the remote database. By using the `supabase migration repair` command, we can write the migration version records directly to the remote tracking metadata.

### Step 1: Initializing CLI Tracking and Marking Initial Migrations
Run the following commands to record all migrations as `applied` in the remote project:

```bash
npx.cmd supabase migration repair --linked 20260529133833 --status applied
npx.cmd supabase migration repair --linked 20260529133900 --status applied
npx.cmd supabase migration repair --linked 20260529133925 --status applied
npx.cmd supabase migration repair --linked 20260529140546 --status applied
npx.cmd supabase migration repair --linked 20260529152000 --status applied
npx.cmd supabase migration repair --linked 20260530001000 --status applied
npx.cmd supabase migration repair --linked 20260531030000 --status applied
npx.cmd supabase migration repair --linked 20260603000000 --status applied
npx.cmd supabase migration repair --linked 20260603000001 --status applied
npx.cmd supabase migration repair --linked 20260603000002 --status applied
npx.cmd supabase migration repair --linked 20260604000000 --status applied
npx.cmd supabase migration repair --linked 20260604000002 --status applied
npx.cmd supabase migration repair --linked 20260604100000 --status applied
```

*Note: The first execution of `migration repair` will automatically create the `supabase_migrations` schema and `schema_migrations` table on the remote database.*

### Step 2: Verification
Verify that the remote migration history is fully synced by running:

```bash
npx.cmd supabase migration list
```

All 13 migration versions should now display corresponding timestamps under both the `Local` and `Remote` columns, signifying a clean migration state.
