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
  console.log("Testing exec_sql...");
  const { data: res1, error: err1 } = await admin.rpc("exec_sql", { sql: "SELECT 1" });
  console.log("exec_sql (sql: SELECT 1) result:", res1, "error:", err1?.message);

  const { data: res2, error: err2 } = await admin.rpc("exec_sql", { query: "SELECT 1" });
  console.log("exec_sql (query: SELECT 1) result:", res2, "error:", err2?.message);

  const { data: res3, error: err3 } = await admin.rpc("exec_sql", { sql_query: "SELECT 1" });
  console.log("exec_sql (sql_query: SELECT 1) result:", res3, "error:", err3?.message);
}

main().catch(console.error);
