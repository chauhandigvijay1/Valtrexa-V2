import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
    const value = trimmed.slice(eq + 1).replace(/^"/, "").replace(/"$/, "").trim();
    env[key] = value;
    process.env[key] = value;
  }
  return env;
}

const env = loadDotEnv();
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const USER_ID = "c8dfc28a-fa3e-4e6d-8027-2f936d0192e0";
const EMAIL = "chauhandigvijay121@gmail.com";

async function invokeRoute(routePath: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> }) {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "api/[...route].ts")).href);
  const handler = mod.default;
  const headers = new Headers(init.headers ?? {});
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const normalizedPath = routePath.startsWith("/api/") ? routePath : `/api/${routePath.replace(/^\/+/, "")}`;
  const request = new Request(`http://localhost${normalizedPath}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const response = await handler.fetch(request);
  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, raw: text };
  }
}

async function main() {
  console.log("=== APPLICATION ANSWERS VALIDATION ===");

  // 1. Get user and auth client
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(USER_ID);
  if (userError || !userData.user) {
    throw new Error(`Failed to get persistent test user: ${userError?.message}`);
  }

  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const signInRes = await authClient.auth.signInWithPassword({
    email: userData.user.email ?? EMAIL,
    password: "CareerCompass#123",
  });
  if (signInRes.error || !signInRes.data.session) {
    throw new Error(`Failed to sign in: ${signInRes.error?.message}`);
  }
  const token = signInRes.data.session.access_token;
  console.log(`Signed in successfully!`);

  // 2. Ensure we have candidate profile
  const { data: profile } = await admin.from("candidate_profiles").select("id").eq("user_id", USER_ID).maybeSingle();
  if (!profile) {
    console.log("Creating candidate profile...");
    await admin.from("candidate_profiles").insert({
      user_id: USER_ID,
      summary: "Experienced software engineer specializing in TypeScript, React, and Supabase.",
    });
  }

  // 3. Create or get test job
  console.log("Creating test job...");
  const { data: job, error: jobErr } = await admin.from("jobs").insert({
    user_id: USER_ID,
    company_name: "Supabase",
    title: "Platform Engineer",
    description: "We need a software engineer with TypeScript, React, Supabase, PostgreSQL, automation, and technical writing skills.",
    match_score: 88,
  }).select("*").single();

  if (jobErr) {
    throw new Error(`Failed to create test job: ${jobErr.message}`);
  }
  console.log(`Job created: ${job.id}`);

  // 4. Create or get company research
  console.log("Creating company research...");
  const { data: research, error: resErr } = await admin.from("company_research").insert({
    user_id: USER_ID,
    company_name: "Supabase",
    tech_stack: ["TypeScript", "React", "Supabase", "PostgreSQL"],
    culture_notes: "Open source, developer-focused, collaborative environment.",
    summary: "Supabase is an open source Firebase alternative built on PostgreSQL.",
  }).select("*").single();

  if (resErr) {
    throw new Error(`Failed to create company research: ${resErr.message}`);
  }
  console.log(`Research created: ${research.id}`);

  // 5. Create or get application
  console.log("Creating application...");
  const { data: application, error: appErr } = await admin.from("applications").insert({
    user_id: USER_ID,
    job_id: job.id,
    company_name: "Supabase",
    role_title: "Platform Engineer",
    status: "applied",
  }).select("*").single();

  if (appErr) {
    throw new Error(`Failed to create application: ${appErr.message}`);
  }
  console.log(`Application created: ${application.id}`);

  // 6. Verify before row counts
  const { count: countBefore } = await admin
    .from("application_answers")
    .select("id", { count: "exact", head: true })
    .eq("application_id", application.id);
  console.log(`Answers row count BEFORE package generation: ${countBefore ?? 0}`);

  // 7. Call package generation API
  console.log("Calling /api/applications/generate-package...");
  const res = await invokeRoute("/api/applications/generate-package", {
    method: "POST",
    token,
    body: {
      jobId: job.id,
      companyName: "Supabase",
      applicationId: application.id,
    },
  });

  if (!res.ok) {
    console.error("API call failed:", res.status, res.data || res.raw);
  } else {
    console.log("API call succeeded!", JSON.stringify(res.data, null, 2));
  }

  // 8. Verify after row counts
  const { count: countAfter } = await admin
    .from("application_answers")
    .select("id", { count: "exact", head: true })
    .eq("application_id", application.id);
  console.log(`Answers row count AFTER package generation: ${countAfter ?? 0}`);
}

main().catch(console.error);
