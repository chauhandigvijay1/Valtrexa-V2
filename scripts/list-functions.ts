import { createClient } from "@supabase/supabase-js";
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
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: tables, error: tablesErr } = await admin
    .from("pg_tables" as any)
    .select("schemaname,tablename")
    .eq("schemaname", "public");
  console.log("public tables:", tables);
  if (tablesErr) console.log("tables error:", tablesErr.message);

  const { data: procs, error: procsErr } = await admin
    .from("pg_proc" as any)
    .select("proname")
    .limit(20);
  console.log("procs:", procs);
  if (procsErr) console.log("procs error:", procsErr.message);
}

main().catch(console.error);
