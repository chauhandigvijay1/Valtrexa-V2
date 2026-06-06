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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tables = [
  "profiles",
  "candidate_profiles",
  "candidate_memory",
  "skills",
  "projects",
  "education",
  "experiences",
  "resumes",
  "resume_versions",
  "resume_parses",
  "tailored_resumes",
  "companies",
  "jobs",
  "company_research",
  "painpoints",
  "outreach_messages",
  "outreach_campaigns",
  "loom_scripts",
  "recruiters",
  "applications",
  "interview_preparation",
  "workflow_events",
  "webhook_subscriptions",
  "ai_generations"
];

async function main() {
  console.log("--- Production Database Table Audit ---");
  for (const table of tables) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`Table "${table}": Error -> ${error.message}`);
    } else {
      console.log(`Table "${table}": ${count} rows`);
    }
  }
}

main().catch(console.error);
