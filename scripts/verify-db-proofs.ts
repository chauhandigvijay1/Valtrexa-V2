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

async function main() {
  console.log("=== VERIFYING DATABASE PROOFS ===");

  // 1. Certifications
  console.log("\n--- Certifications ---");
  const certs = await admin.from("certifications").select("*").limit(2);
  console.log("Rows:", JSON.stringify(certs.data, null, 2));

  // 2. Recruiters
  console.log("\n--- Recruiters (Discovered & Manual) ---");
  const recs = await admin.from("recruiters").select("name,company,role,profile_url,source,relevance_score").limit(2);
  console.log("Rows:", JSON.stringify(recs.data, null, 2));

  // 3. Companies
  console.log("\n--- Companies ---");
  const comps = await admin.from("companies").select("name,target_value,company_quality_score,strategic_value_score,founder_detected").limit(2);
  console.log("Rows:", JSON.stringify(comps.data, null, 2));
}

main().catch(console.error);
