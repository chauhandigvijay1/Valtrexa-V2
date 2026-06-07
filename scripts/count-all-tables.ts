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

const tables = [
  "application_answers",
  "applications",
  "candidate_profiles",
  "companies",
  "education",
  "experiences",
  "followups",
  "integrations",
  "interview_preparation",
  "interviews",
  "jobs",
  "n8n_webhook_subscriptions",
  "profiles",
  "projects",
  "recruiters",
  "resume_analyses",
  "resume_versions",
  "resumes",
  "skills",
  "tailored_resumes",
  "workflow_events",
];

async function main() {
  console.log("=== DB INVENTORY ===");
  for (const table of tables) {
    try {
      const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
      if (error) {
        console.log(`${table} .... error (${error.message})`);
      } else {
        console.log(`${table} .... ${count ?? 0}`);
      }
    } catch (err: any) {
      console.log(`${table} .... exception (${err.message})`);
    }
  }
}

main().catch(console.error);
