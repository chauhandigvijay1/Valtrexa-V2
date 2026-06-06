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
  console.log("--- Fetching one row from resume_parses ---");
  const { data: parses, error: errParses } = await admin.from("resume_parses").select("*").limit(1);
  if (errParses) {
    console.error("Error fetching parses:", errParses);
  } else {
    console.log("Parse row:", JSON.stringify(parses, null, 2));
  }

  console.log("--- Fetching all AI Generations ---");
  const { data: ai, error: errAi } = await admin.from("ai_generations").select("*").order("created_at", { ascending: false }).limit(3);
  if (errAi) {
    console.error("Error fetching AI gens:", errAi);
  } else {
    console.log("AI Generations:", JSON.stringify(ai, null, 2));
  }
}

main().catch(console.error);
