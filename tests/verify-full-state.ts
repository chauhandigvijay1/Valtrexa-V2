import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const d = readFileSync(".env", "utf-8");
const url = (d.match(/SUPABASE_URL=(.+)/)?.[1] || "").trim().replace(/'/g, "");
const key = (d.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1] || "").trim().replace(/'/g, "");
const sb = createClient(url, key, { auth: { persistSession: false } });

async function verify() {
  // Verify provider_cookies access
  const { data: pc, error: pce } = await sb.from("provider_cookies").select("*").limit(5);
  console.log("provider_cookies:", pce ? "❌ " + pce.message : "✅ " + (pc?.length ?? 0) + " rows");

  // Get the primary user
  const { data: ws } = await sb.from("workflow_state").select("user_id,status").limit(1);
  const userId = ws?.[0]?.user_id;
  console.log("Primary user:", userId || "none found");

  // Get user's resume
  const { data: res } = await sb.from("resumes").select("id,title").eq("user_id", userId).limit(3);
  console.log("Resumes for user:", JSON.stringify(res));

  // Check if Resume1.pdf is already uploaded
  const { data: storage } = await sb.storage.from("resumes").list(userId);
  if (storage)
    console.log(
      "Storage files for user:",
      storage.length,
      "files",
      JSON.stringify(storage.slice(0, 3)),
    );
  else console.log("Storage: no files or bucket missing");

  // Check candidate brain for user
  const brain = await sb.from("candidate_profiles").select("*").eq("user_id", userId);
  console.log(
    "candidate_profiles:",
    brain.error ? "❌ " + brain.error.message : "✅ " + (brain.data?.length ?? 0) + " rows",
  );

  const skills = await sb.from("skills").select("skill_name,level").eq("user_id", userId);
  console.log("skills:", skills.data?.length ?? 0, "entries");
  if (skills.data?.length)
    skills.data.slice(0, 5).forEach((s) => console.log("  -", s.skill_name, ":", s.level));

  const projs = await sb.from("projects").select("name,tech_stack").eq("user_id", userId);
  console.log("projects:", projs.data?.length ?? 0, "entries");

  const exp = await sb
    .from("experiences")
    .select("company,title,start_date,end_date")
    .eq("user_id", userId);
  console.log("experiences:", exp.data?.length ?? 0, "entries");

  const edu = await sb.from("education").select("school,degree,field").eq("user_id", userId);
  console.log("education:", edu.data?.length ?? 0, "entries");
}
verify().catch((e) => console.log("FATAL:", e.message));
