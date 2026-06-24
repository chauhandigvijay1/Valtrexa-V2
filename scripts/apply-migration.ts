import { config } from "dotenv";
import pg from "pg";
config({ path: ".env" });

const MIGRATIONS_SQL = `
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS primary_resume_id uuid;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS external_id text;
`;

async function migrate() {
  // Try multiple connection string sources
  const dbUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.DIRECT_URL || "";

  if (!dbUrl) {
    console.log("No DATABASE_URL found — skipping auto-migration.");
    console.log("Set DATABASE_URL in .env to run migrations automatically.");
    return;
  }

  console.log(`Connecting to database...`);
  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log("Connected. Running migrations...");

    const statements = MIGRATIONS_SQL.split(";").filter((s) => s.trim());
    for (const sql of statements) {
      try {
        await client.query(sql + ";");
        const match = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)/);
        console.log(`  ✅ ${match ? match[1] : "migration"}`);
      } catch (e: any) {
        console.log(`  ❌ ${e.message.substring(0, 100)}`);
      }
    }

    client.release();
    console.log("Migrations complete.");
  } catch (e: any) {
    console.log(`Database connection failed: ${e.message}`);
    console.log(
      "Migrations skipped. Columns must be added manually via Supabase Dashboard SQL Editor.",
    );
    console.log("SQL to run:");
    console.log(MIGRATIONS_SQL);
  } finally {
    await pool.end();
  }
}

migrate().catch((e) => console.error(e));
