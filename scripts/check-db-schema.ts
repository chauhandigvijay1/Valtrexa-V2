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
    const value = trimmed.slice(eq + 1).replace(/^"/, "").replace(/"$/, "").trim();
    env[key] = value;
  }
  return env;
}

const env = loadDotEnv();
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTable(tableName: string) {
  const { data, error } = await admin.from(tableName).select("*").limit(1);
  if (error) {
    console.log(`Table ${tableName} error:`, error.message);
  } else {
    console.log(`Table ${tableName} exists! Row:`, data);
  }
}

async function checkTailoredResumes() {
  const { data, error } = await admin.from("tailored_resumes").select("id, pdf_storage_path, pdf_file_size, pdf_page_count, pdf_verified, storage_path").order("created_at", { ascending: false }).limit(2);
  if (error) {
    console.log("tailored_resumes error:", error.message);
  } else {
    console.log("tailored_resumes rows:", data);
  }
}

async function main() {
  await checkTable("followups");
  await checkTable("candidate_profiles");
  await checkTable("candidate_memory");
  await checkTable("skills");
  await checkTable("projects");
  await checkTable("education");
  await checkTable("experiences");
  await checkTable("companies");
  await checkTable("application_answers");
  await checkTailoredResumes();
}

main().catch(console.error);
