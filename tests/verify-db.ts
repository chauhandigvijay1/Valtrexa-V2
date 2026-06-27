import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const dotenv = readFileSync(".env", "utf-8");
const url = (dotenv.match(/SUPABASE_URL=(.+)/)?.[1]?.trim() ?? "").replace(/['"]/g, "");
const key = (dotenv.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim() ?? "").replace(
  /['"]/g,
  "",
);

console.log("Supabase URL:", url ? `OK (${url})` : "MISSING");
console.log("Service Key:", key ? `OK (${key.slice(0, 8)}...${key.slice(-4)})` : "MISSING");

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // Check all critical tables
  const tables = [
    "provider_cookies",
    "workflow_state",
    "applications",
    "resumes",
    "resume_versions",
    "candidate_brain_skills",
    "candidate_brain_experience",
    "candidate_brain_education",
    "candidate_brain_projects",
    "provider_controls",
    "notifications",
    "queue_jobs",
    "browser_sessions",
    "integrations",
    "recruiters",
    "outreach_drafts",
  ];
  for (const t of tables) {
    try {
      const { data, error } = await sb.from(t).select("*", { count: "exact", head: true });
      console.log(`  ${t}: ${error ? `❌ ${error.message}` : `✅ ${data?.length ?? 0} rows`}`);
    } catch (e: any) {
      console.log(`  ${t}: ❌ ${e.message}`);
    }
  }
}
main().catch((e) => console.error("FATAL:", e.message));
