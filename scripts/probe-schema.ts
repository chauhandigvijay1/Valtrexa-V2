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

async function getColumns(table: string) {
  // Insert a minimal row, read columns, then delete
  const { data, error } = await admin.rpc("get_table_columns" as any, { tbl: table });
  if (error) {
    // fallback: try inserting null to see what columns error references
    console.log(`${table}: RPC failed, trying schema introspection`);
    const { error: insertErr } = await admin.from(table).insert({}).select("*");
    console.log(`${table} insert error:`, insertErr?.message);
  } else {
    console.log(`${table} columns:`, data);
  }
}

async function main() {
  // Use the Supabase REST API to get schema info
  // Try inserting a minimal record to discover column requirements

  console.log("=== FOLLOWUPS TABLE COLUMNS ===");
  const { error: fErr } = await admin
    .from("followups")
    .insert({ user_id: "00000000-0000-0000-0000-000000000000" } as any);
  console.log("followups insert error (expected):", fErr?.message);

  console.log("\n=== INTERVIEW_PREPARATION TABLE COLUMNS ===");
  const { error: ipErr } = await admin
    .from("interview_preparation")
    .insert({ user_id: "00000000-0000-0000-0000-000000000000" } as any);
  console.log("interview_preparation insert error (expected):", ipErr?.message);

  console.log("\n=== APPLICATION_ANSWERS TABLE COLUMNS ===");
  const { error: aaErr } = await admin
    .from("application_answers")
    .insert({ user_id: "00000000-0000-0000-0000-000000000000" } as any);
  console.log("application_answers insert error (expected):", aaErr?.message);

  console.log("\n=== COMPANIES TABLE COLUMNS ===");
  const { error: cErr } = await admin
    .from("companies")
    .insert({ user_id: "00000000-0000-0000-0000-000000000000" } as any);
  console.log("companies insert error (expected):", cErr?.message);

  console.log("\n=== FOLLOW_UPS TABLE COLUMNS (dual table) ===");
  const { error: fuErr } = await admin
    .from("follow_ups")
    .insert({ user_id: "00000000-0000-0000-0000-000000000000" } as any);
  console.log("follow_ups insert error (expected):", fuErr?.message);

  // Now let's get the actual user IDs we can work with
  console.log("\n=== EXISTING USERS ===");
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 5 });
  for (const u of users?.users ?? []) {
    console.log(`  ${u.id} | ${u.email}`);
  }

  // Get existing applications
  console.log("\n=== EXISTING APPLICATIONS ===");
  const { data: apps } = await admin
    .from("applications")
    .select("id, user_id, company_name, role_title, status, job_id")
    .limit(5);
  console.log(apps);

  // Get existing interviews
  console.log("\n=== EXISTING INTERVIEWS ===");
  const { data: ivs } = await admin
    .from("interviews")
    .select("id, user_id, company_name, role_title, status, application_id")
    .limit(5);
  console.log(ivs);

  // Get existing recruiters
  console.log("\n=== EXISTING RECRUITERS ===");
  const { data: recs } = await admin
    .from("recruiters")
    .select("id, user_id, name, company, email")
    .limit(5);
  console.log(recs);
}

main().catch(console.error);
