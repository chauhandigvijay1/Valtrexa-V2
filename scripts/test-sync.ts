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
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const userId = "e178c157-318a-4a41-8aea-b964fff877f8"; // existing user ID from check-tables.ts
  const parsed = {
    skills: ["React", "Next.js", "Node.js"],
  };

  console.log("Attempting to delete skills for user...");
  const delRes = await admin.from("skills").delete().eq("user_id", userId);
  console.log("Delete result:", delRes.error);

  console.log("Attempting to insert skill...");
  const insRes = await admin.from("skills").insert({
    user_id: userId,
    name: "React",
    level: "intermediate",
  });
  console.log("Insert result:", insRes.error);
}

main().catch(console.error);
