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
  "candidate_profiles",
  "skills",
  "projects",
  "education",
  "experiences",
  "applications",
  "application_answers",
  "recruiters",
  "followups",
  "interviews",
  "interview_preparation",
  "companies",
];

async function main() {
  console.log("=== DB PROOF ===");

  // Check schema migrations if accessible
  try {
    // We can query using the Supabase client if exposed, otherwise query the catalog tables
    const { data: migrations, error } = await admin
      .from("schema_migrations" as any)
      .select("version");
    if (!error && migrations) {
      console.log(
        "schema_migrations versions:",
        migrations.map((m: any) => m.version),
      );
    } else {
      console.log("schema_migrations error:", error?.message ?? "not found");
    }
  } catch (err: any) {
    console.log("schema_migrations check exception:", err.message);
  }

  for (const table of tables) {
    try {
      const { data, count, error } = await admin
        .from(table)
        .select("id, created_at", { count: "exact" })
        .order("created_at", { ascending: false } as any)
        .limit(1);

      if (error) {
        if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
          console.log(`${table}: exists=NO, count=0, latest_id=N/A, latest_created_at=N/A`);
        } else {
          console.log(
            `${table}: exists=YES, count=error (${error.message}), latest_id=N/A, latest_created_at=N/A`,
          );
        }
      } else {
        const rowCount = count ?? 0;
        const latestId = data?.[0]?.id ?? "N/A";
        const latestCreatedAt = data?.[0]?.created_at ?? "N/A";
        console.log(
          `${table}: exists=YES, count=${rowCount}, latest_id=${latestId}, latest_created_at=${latestCreatedAt}`,
        );
      }
    } catch (err: any) {
      console.log(
        `${table}: exists=NO, count=0, latest_id=N/A, latest_created_at=N/A (Exception: ${err.message})`,
      );
    }
  }
}

main().catch(console.error);
