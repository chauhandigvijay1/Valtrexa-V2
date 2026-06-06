import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
    const value = trimmed.slice(eq + 1).replace(/^"/, "").replace(/"$/, "").trim();
    env[key] = value;
  }
  return env;
}

const env = loadDotEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("--- Applications ---");
  const { data: apps, error: errApps } = await admin.from("applications").select("*").limit(3);
  console.log(JSON.stringify(apps, null, 2));

  console.log("--- Recruiters ---");
  const { data: recs, error: errRecs } = await admin.from("recruiters").select("*").limit(3);
  console.log(JSON.stringify(recs, null, 2));

  console.log("--- Followups ---");
  const { data: folls, error: errFolls } = await admin.from("followups").select("*").limit(3);
  console.log(JSON.stringify(folls, null, 2));

  console.log("--- Interview Prep ---");
  const { data: preps, error: errPreps } = await admin.from("interview_preparation").select("*").limit(3);
  console.log(JSON.stringify(preps, null, 2));
}

main().catch(console.error);
