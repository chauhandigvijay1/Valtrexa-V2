import { readFileSync } from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  const raw = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .replace(/^"/, "")
      .replace(/"$/, "")
      .trim();
    env[key] = value;
  }
  return env;
}

const env = loadDotEnv();
// Extract project ref from URL: https://ubpjhunogqddyatqdjva.supabase.co
const projectRef = new URL(env.SUPABASE_URL).hostname.split(".")[0];
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260604100000_phase_recovery.sql",
);
const sql = readFileSync(migrationPath, "utf-8");

async function runSQL(query: string): Promise<{ ok: boolean; error?: string; data?: any }> {
  // Use the Supabase database query endpoint
  const url = `https://${projectRef}.supabase.co/rest/v1/rpc/`;

  // Alternative: use the PostgREST query endpoint with a raw SQL function
  // First, try to create a temporary function for executing SQL
  const createFuncSQL = `
    CREATE OR REPLACE FUNCTION public.exec_migration(sql_text text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_text;
    END;
    $$;
  `;

  // Try the raw database endpoint (port 5432 via pooler)
  // This requires pg client, let's use the REST approach differently

  const response = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/exec_migration`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql_text: query }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text };
  }
  return { ok: true };
}

async function main() {
  console.log(`Project ref: ${projectRef}`);
  console.log("Applying migration via direct database connection...\n");

  // Split SQL into individual statements
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  // First try to create the exec_migration function
  const createFunc = await runSQL("SELECT 1");
  if (!createFunc.ok) {
    console.log("No exec_migration function available.");
    console.log("Will attempt to use the database pooler connection directly.\n");
  }

  // Use pg module to connect directly
  try {
    const { Pool } = await import("pg");

    // Supabase pooler connection
    const pool = new Pool({
      host: `db.${projectRef}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: "postgres.ubpjhunogqddyatqdjva",
      password: SERVICE_KEY,
      ssl: { rejectUnauthorized: false },
    });

    const client = await pool.connect();
    console.log("Connected to database directly via pg!");

    for (const stmt of statements) {
      const label = stmt.slice(0, 80).replace(/\n/g, " ");
      try {
        await client.query(stmt);
        console.log(`✅ ${label}...`);
      } catch (err: any) {
        if (err.message?.includes("already exists")) {
          console.log(`⏭️  ${label}... (already exists)`);
        } else {
          console.log(`❌ ${label}...`);
          console.log(`   Error: ${err.message}`);
        }
      }
    }

    client.release();
    await pool.end();
  } catch (pgErr: any) {
    console.log("pg module not available or connection failed:", pgErr.message);
    console.log("\n⚠️  Please apply the migration manually via Supabase Dashboard SQL Editor:");
    console.log(`File: supabase/migrations/20260604100000_phase_recovery.sql`);
  }
}

main().catch(console.error);
