import fs from "node:fs/promises";
import postgres from "postgres";

async function main() {
  const envText = await fs.readFile(".env", "utf-8");
  const env: Record<string, string> = {};
  envText.split(/\r?\n/).forEach(line => {
    const eq = line.indexOf("=");
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq+1).trim().replace(/^"/, "").replace(/"$/, "");
  });

  const sql = postgres(env["SUPABASE_DB_URL"], { ssl: "require" });
  
  console.log("--- Policies for workflow_events ---");
  const policies = await sql`
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename = 'workflow_events';
  `;
  console.log(JSON.stringify(policies, null, 2));

  console.log("--- Triggers on recruiters ---");
  const triggers = await sql`
    SELECT tgname, tgtype, tgenabled, tgsecdef 
    FROM pg_trigger 
    WHERE tgrelid = 'public.recruiters'::regclass;
  `;
  console.log(JSON.stringify(triggers, null, 2));

  console.log("--- Function definition for enqueue_direct_crud_workflow_event ---");
  const func = await sql`
    SELECT proname, prosecdef, prosrc 
    FROM pg_proc 
    WHERE proname = 'enqueue_direct_crud_workflow_event';
  `;
  console.log(JSON.stringify(func, null, 2));

  process.exit(0);
}

main().catch(console.error);
