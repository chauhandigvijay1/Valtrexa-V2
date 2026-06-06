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
  console.log("=== SQL QUERY OUTPUTS (VIA API CLIENT) ===");

  console.log("\n1. select * from certifications limit 5;");
  const { data: certs } = await admin.from("certifications").select("*").limit(5);
  console.log(JSON.stringify(certs, null, 2));

  console.log("\n2. select name, role, profile_url, source from recruiters where source='discovery';");
  const { data: recs } = await admin.from("recruiters").select("name,role,profile_url,source").eq("source", "discovery");
  console.log(JSON.stringify(recs, null, 2));

  console.log("\n3. select company_quality_score, strategic_value_score, founder_detected from companies limit 10;");
  const { data: comps } = await admin.from("companies").select("company_quality_score,strategic_value_score,founder_detected").limit(10);
  console.log(JSON.stringify(comps, null, 2));
}

main().catch(console.error);
