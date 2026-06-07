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

const TABLES = [
  "profiles",
  "candidate_profiles",
  "candidate_brain",
  "candidate_memory",
  "skills",
  "education",
  "experiences",
  "projects",
  "resumes",
  "resume_versions",
  "resume_parses",
  "resume_analyses",
  "tailored_resumes",
  "jobs",
  "job_matches",
  "job_import_runs",
  "applications",
  "interviews",
  "interview_preparation",
  "recruiters",
  "recruiter_conversations",
  "followups",
  "follow_ups",
  "company_research",
  "painpoints",
  "companies",
  "outreach_messages",
  "outreach_campaigns",
  "loom_scripts",
  "workflow_events",
  "n8n_webhook_subscriptions",
  "notification_queue",
  "alert_preferences",
  "assessments",
  "daily_summaries",
  "ai_generations",
  "integrations",
  "learning_loop",
  "application_answers",
];

async function main() {
  console.log("=== TABLE EXISTENCE & ROW COUNTS ===\n");
  for (const table of TABLES) {
    const { data, error, count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true });
    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
    } else {
      console.log(`✅ ${table}: ${count ?? 0} rows`);
    }
  }

  // Check followups column structure
  console.log("\n=== FOLLOWUPS TABLE SAMPLE ===");
  const fu = await admin.from("followups").select("*").limit(1);
  if (fu.error) {
    console.log("followups error:", fu.error.message);
  } else {
    console.log("followups columns:", fu.data?.[0] ? Object.keys(fu.data[0]) : "EMPTY");
  }

  // Check interviews table columns
  console.log("\n=== INTERVIEWS TABLE SAMPLE ===");
  const iv = await admin.from("interviews").select("*").limit(1);
  if (iv.error) {
    console.log("interviews error:", iv.error.message);
  } else {
    console.log("interviews columns:", iv.data?.[0] ? Object.keys(iv.data[0]) : "EMPTY");
  }

  // Check interview_preparation table columns
  console.log("\n=== INTERVIEW_PREPARATION TABLE SAMPLE ===");
  const ip = await admin.from("interview_preparation").select("*").limit(1);
  if (ip.error) {
    console.log("interview_preparation error:", ip.error.message);
  } else {
    console.log("interview_preparation columns:", ip.data?.[0] ? Object.keys(ip.data[0]) : "EMPTY");
  }

  // Check applications table columns
  console.log("\n=== APPLICATIONS TABLE SAMPLE ===");
  const ap = await admin.from("applications").select("*").limit(1);
  if (ap.error) {
    console.log("applications error:", ap.error.message);
  } else {
    console.log("applications columns:", ap.data?.[0] ? Object.keys(ap.data[0]) : "EMPTY");
  }

  // Check companies table columns
  console.log("\n=== COMPANIES TABLE SAMPLE ===");
  const co = await admin.from("companies").select("*").limit(1);
  if (co.error) {
    console.log("companies error:", co.error.message);
  } else {
    console.log("companies columns:", co.data?.[0] ? Object.keys(co.data[0]) : "EMPTY");
  }

  // Check recruiters table columns
  console.log("\n=== RECRUITERS TABLE SAMPLE ===");
  const rec = await admin.from("recruiters").select("*").limit(1);
  if (rec.error) {
    console.log("recruiters error:", rec.error.message);
  } else {
    console.log("recruiters columns:", rec.data?.[0] ? Object.keys(rec.data[0]) : "EMPTY");
  }
}

main().catch(console.error);
