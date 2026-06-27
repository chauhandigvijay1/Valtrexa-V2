import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const d = readFileSync(".env", "utf-8");
const url = (d.match(/SUPABASE_URL=(.+)/)?.[1] || "").trim().replace(/'/g, "");
const key = (d.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1] || "").trim().replace(/'/g, "");
const sb = createClient(url, key, { auth: { persistSession: false } });
const USER_ID = "e178c157-318a-4a41-8aea-b964fff877f8";

async function verify() {
  // Check candidate_profiles
  const { data: cp } = await sb
    .from("candidate_profiles")
    .select(
      "current_title, years_experience, summary, resume_raw_text, parsed_resume->skills, remote_preference",
    )
    .eq("user_id", USER_ID);
  console.log("=== CANDIDATE PROFILE ===");
  console.log("Title:", cp?.[0]?.current_title);
  console.log("Years exp:", cp?.[0]?.years_experience);
  console.log("Remote pref:", cp?.[0]?.remote_preference);
  console.log("Summary:", cp?.[0]?.summary?.slice(0, 150));

  // Check skills
  const { data: sk } = await sb
    .from("skills")
    .select("name, category, level")
    .eq("user_id", USER_ID)
    .order("name");
  console.log("\n=== SKILLS (" + (sk?.length || 0) + ") ===");
  sk?.slice(0, 10).forEach((s) =>
    console.log("  " + s.name + " [" + s.category + "] level=" + s.level),
  );
  if ((sk?.length || 0) > 10) console.log("  ... and " + ((sk?.length || 0) - 10) + " more");

  // Check projects
  const { data: pr } = await sb
    .from("projects")
    .select("name, tech_stack, description")
    .eq("user_id", USER_ID);
  console.log("\n=== PROJECTS (" + (pr?.length || 0) + ") ===");
  pr?.forEach((p) => console.log("  " + p.name + " | " + (p.tech_stack?.join(", ") || "no tech")));

  // Check education
  const { data: ed } = await sb
    .from("education")
    .select("school, degree, field")
    .eq("user_id", USER_ID);
  console.log("\n=== EDUCATION (" + (ed?.length || 0) + ") ===");
  ed?.forEach((e) =>
    console.log("  " + e.school + " | " + (e.degree || "") + " " + (e.field || "")),
  );

  // Check verification: NO headings or contact info in skills
  const badSkills = sk?.filter((s) =>
    /email|phone|address|linkedin|github|http|experience|education|skills|projects|summary|contact/i.test(
      s.name,
    ),
  );
  if (badSkills?.length) {
    console.log("\n❌ MISCLASSIFIED SKILLS:", badSkills.map((s) => s.name).join(", "));
  } else {
    console.log("\n✅ NO MISCLASSIFIED SKILLS — headings/contact info correctly excluded");
  }

  // Verify parse result saved
  const { data: rv } = await sb
    .from("resume_versions")
    .select("parse_result, confidence_score")
    .eq("resume_id", "939462dc-ef9b-40d5-8152-ea167e89b437");
  console.log("\n=== PARSE RESULT SAVED ===");
  console.log("Has parse_result:", rv?.[0]?.parse_result ? "✅ YES" : "❌ NO");
  console.log("Confidence:", rv?.[0]?.confidence_score);
}
verify().catch((e) => console.log("FATAL:", e.message));
