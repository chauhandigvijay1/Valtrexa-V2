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
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Create user
  const email = `test-rls-${Date.now()}@example.com`;
  const password = "CareerCompass#123";
  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !userRes.user) {
    console.error("Failed to create user", userErr);
    return;
  }
  const userId = userRes.user.id;
  console.log(`Created test user: ${userId}`);

  // Sign in
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data: sessionRes, error: authErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr || !sessionRes.session) {
    console.error("Auth error", authErr);
    return;
  }
  console.log(`Signed in successfully. Token: ${sessionRes.session.access_token.slice(0, 15)}...`);

  // Insert recruiter
  const { data: recData, error: recErr } = await client
    .from("recruiters")
    .insert({
      user_id: userId,
      name: "RLS Tester",
      company: "Test Co",
      email: "rls@test.com",
    })
    .select("*")
    .single();

  if (recErr) {
    console.error("Insert recruiter failed:", JSON.stringify(recErr, null, 2));
  } else {
    console.log("Recruiter inserted successfully:", recData);
  }

  // Cleanup
  await admin.auth.admin.deleteUser(userId);
}

main().catch(console.error);
