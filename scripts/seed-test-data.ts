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

const USER_ID = "c8dfc28a-fa3e-4e6d-8027-2f936d0192e0";

async function main() {
  console.log("=== SEEDING TEST DATA ===\n");

  // 1. Seed companies (for HVT gating)
  console.log("--- Companies ---");
  const companies = [
    {
      user_id: USER_ID,
      name: "BreadButter",
      target_value: "high",
      company_quality_score: 85,
      hiring_activity_score: 70,
      strategic_value_score: 90,
    },
    {
      user_id: USER_ID,
      name: "Supabase",
      target_value: "high",
      company_quality_score: 95,
      hiring_activity_score: 85,
      strategic_value_score: 95,
    },
    {
      user_id: USER_ID,
      name: "Vercel",
      target_value: "normal",
      company_quality_score: 90,
      hiring_activity_score: 80,
      strategic_value_score: 75,
    },
  ];
  for (const c of companies) {
    const existing = await admin
      .from("companies")
      .select("id")
      .eq("user_id", USER_ID)
      .ilike("name", c.name)
      .maybeSingle();
    if (existing.data?.id) {
      await admin.from("companies").update(c).eq("id", existing.data.id);
      console.log(`  Updated: ${c.name}`);
    } else {
      const { error } = await admin.from("companies").insert(c);
      if (error) console.log(`  ❌ ${c.name}: ${error.message}`);
      else console.log(`  ✅ ${c.name}`);
    }
  }

  // 2. Seed followups
  console.log("\n--- Follow-ups ---");
  const appResult = await admin
    .from("applications")
    .select("id, company_name")
    .eq("user_id", USER_ID)
    .limit(3);
  const apps = appResult.data ?? [];
  const recResult = await admin
    .from("recruiters")
    .select("id, name")
    .eq("user_id", USER_ID)
    .limit(2);
  const recs = recResult.data ?? [];

  const followups = [
    {
      user_id: USER_ID,
      application_id: apps[0]?.id || null,
      recruiter_id: recs[0]?.id || null,
      due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      note: "Follow up on application status - BreadButter Full Stack role",
      done: false,
    },
    {
      user_id: USER_ID,
      application_id: apps[1]?.id || null,
      recruiter_id: recs[1]?.id || null,
      due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      note: "Send thank-you note after initial screening call",
      done: false,
    },
    {
      user_id: USER_ID,
      application_id: null,
      recruiter_id: recs[0]?.id || null,
      due_at: new Date(Date.now() + 1 * 86400000).toISOString(),
      note: "Check if recruiter responded to LinkedIn DM",
      done: false,
    },
  ];

  for (const f of followups) {
    const { data, error } = await admin.from("followups").insert(f).select("id").single();
    if (error) console.log(`  ❌ followup: ${error.message}`);
    else console.log(`  ✅ followup ${data.id}: ${f.note?.slice(0, 50)}`);
  }

  // 3. Seed interview_preparation (linked to existing interviews)
  console.log("\n--- Interview Preparation ---");
  const ivResult = await admin
    .from("interviews")
    .select("id, company_name, role_title")
    .eq("user_id", USER_ID)
    .limit(3);
  const interviews = ivResult.data ?? [];

  for (const iv of interviews) {
    const topics = [
      {
        topic: `System Design for ${iv.role_title || "the role"}`,
        notes: `Prepare distributed systems design scenarios. Focus on scalability patterns used at ${iv.company_name}. Cover: load balancing, caching strategies, database sharding, message queues. Practice whiteboard diagrams.`,
      },
      {
        topic: `${iv.company_name} Culture & Values`,
        notes: `Research ${iv.company_name}'s engineering blog, recent talks, and open source contributions. Prepare STAR stories that align with their values. Know their tech stack and recent product launches.`,
      },
      {
        topic: `Behavioral Questions`,
        notes: `Prepare answers for: Tell me about a time you disagreed with a teammate. Describe your most challenging project. How do you handle ambiguity? What's your approach to code reviews?`,
      },
      {
        topic: `Technical Deep Dive`,
        notes: `Be ready to discuss: React performance optimization, Node.js event loop, TypeScript advanced patterns, CI/CD pipelines, testing strategies, monitoring and observability.`,
      },
    ];

    for (const t of topics) {
      const { data, error } = await admin
        .from("interview_preparation")
        .insert({
          user_id: USER_ID,
          interview_id: iv.id,
          topic: t.topic,
          notes: t.notes,
          completed: false,
          resources: [],
        } as any)
        .select("id")
        .single();
      if (error) console.log(`  ❌ prep: ${error.message}`);
      else console.log(`  ✅ prep ${data.id}: ${t.topic}`);
    }
  }

  // 4. Update recruiters with discovery metadata
  console.log("\n--- Recruiter Discovery Updates ---");
  for (const rec of recs) {
    const { error } = await admin
      .from("recruiters")
      .update({
        company: "BreadButter",
        email: `${rec.name?.toLowerCase().replace(/\s/g, ".")}@breadbutter.io`,
        linkedin_url: `https://linkedin.com/in/${rec.name?.toLowerCase().replace(/\s/g, "-")}`,
        notes: "Discovered via LinkedIn search. Active recruiter hiring for full-stack roles.",
        last_contacted_at: new Date().toISOString(),
      })
      .eq("id", rec.id);
    if (error) console.log(`  ❌ recruiter ${rec.id}: ${error.message}`);
    else console.log(`  ✅ recruiter ${rec.id} updated`);
  }

  // 5. Verify row counts
  console.log("\n=== FINAL ROW COUNTS ===");
  const tables = [
    "companies",
    "followups",
    "interview_preparation",
    "recruiters",
    "applications",
    "interviews",
  ];
  for (const table of tables) {
    const { count, error } = await admin.from(table).select("id", { count: "exact", head: true });
    if (error) console.log(`  ❌ ${table}: ${error.message}`);
    else console.log(`  ${table}: ${count} rows`);
  }
}

main().catch(console.error);
