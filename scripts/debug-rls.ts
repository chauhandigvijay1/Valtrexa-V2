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

async function main() {
  const env = loadDotEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  console.log("--- policies ---");
  const { data: policies, error: polErr } = await supabase.rpc("get_policies"); // fallback if not exist
  const { data: rawPol } = await supabase
    .from("pg_policies" as any)
    .select("*")
    .ilike("tablename", "workflow_events");
  console.log(JSON.stringify(rawPol, null, 2));

  console.log("--- trigger owner and security definer ---");
  const { data: rawFunc } = await supabase.rpc("get_func" as any).catch(() => ({ data: null }));

  // Let's run a raw query to check details of trigger functions
  const query = `
    SELECT proname, prosecuridef, prosrc 
    FROM pg_proc 
    WHERE proname = 'enqueue_direct_crud_workflow_event' 
       OR proname = 'enqueue_notification_from_workflow_event';
  `;
  // We can query using RPC if there's a sql execution endpoint, or we can just try to run it via migration or similar.
}

main().catch(console.error);
