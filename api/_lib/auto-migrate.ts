import { config } from "dotenv";
import pg from "pg";
config({ path: ".env" });

const MIGRATIONS_SQL = `
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS primary_resume_id uuid;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS raw_payload jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS normalized_roles text[] DEFAULT '{}';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS work_mode text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_min integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_max integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS freshness_bucket text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS freshness_score integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS provider text;
`;

let migrated = false;

export async function runAutoMigration(): Promise<boolean> {
  if (migrated) return true;

  const dbUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.DIRECT_URL || "";

  if (!dbUrl) {
    console.log("[migrate] No DATABASE_URL — auto-migration skipped");
    return false;
  }

  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log("[migrate] Connected. Running schema migrations...");

    const statements = MIGRATIONS_SQL.split(";").filter((s) => s.trim());
    let success = 0,
      fail = 0;
    for (const sql of statements) {
      try {
        await client.query(sql + ";");
        const match = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)/);
        if (match) {
          console.log(`[migrate] ✅ column: ${match[1]}`);
          success++;
        }
      } catch (e: any) {
        console.log(`[migrate] ❌ ${e.message.substring(0, 100)}`);
        fail++;
      }
    }

    client.release();
    migrated = success > 0;
    console.log(`[migrate] Done: ${success} applied, ${fail} failed`);
    return success > 0;
  } catch (e: any) {
    console.log(`[migrate] Connection failed: ${e.message.substring(0, 100)}`);
    console.log("[migrate] Run this SQL manually in Supabase Dashboard SQL Editor:");
    console.log(MIGRATIONS_SQL);
    return false;
  } finally {
    await pool.end();
  }
}
