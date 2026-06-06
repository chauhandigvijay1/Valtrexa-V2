import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

async function main() {
  const envText = await fs.readFile(".env", "utf-8");
  const env = {};
  envText.split("\n").forEach(line => {
    const eq = line.indexOf("=");
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq+1).trim().replace(/^"/, "").replace(/"$/, "");
  });

  const sql = postgres(env["SUPABASE_DB_URL"], { ssl: "require" });
  await sql`NOTIFY pgrst, 'reload schema'`;
  console.log("Schema reloaded.");
  process.exit(0);
}
main().catch(console.error);
