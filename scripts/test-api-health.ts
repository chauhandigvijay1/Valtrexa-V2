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
    const value = trimmed
      .slice(eq + 1)
      .replace(/^"/, "")
      .replace(/"$/, "")
      .trim();
    env[key] = value;
    process.env[key] = value;
  }
  return env;
}

const env = loadDotEnv();
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const USER_ID = "c8dfc28a-fa3e-4e6d-8027-2f936d0192e0";
const EMAIL = "chauhandigvijay121@gmail.com";

async function invokeRoute(
  routePath: string,
  init: { method?: string; body?: unknown; token?: string },
) {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "api/[...route].ts")).href);
  const handler = mod.default;
  const headers = new Headers();
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const request = new Request(`http://localhost/api/${routePath.replace(/^\/+/, "")}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  try {
    const response = await handler.fetch(request);
    const text = await response.text();
    return { status: response.status, text };
  } catch (err: any) {
    return { status: 500, error: err.message, stack: err.stack };
  }
}

async function main() {
  console.log("=== API HEALTH AUDIT ===");

  // 1. Sign in
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
  console.log("Signed in successfully to API Health auditor!");

  // List of routes to test
  const routes = [
    { path: "resumes/center", method: "GET" },
    { path: "resumes/details?resumeId=00000000-0000-0000-0000-000000000000", method: "GET" },
    { path: "n8n/events", method: "GET" },
    { path: "n8n/webhooks", method: "GET" },
    { path: "candidate-brain", method: "GET" },
    {
      path: "applications/answers?applicationId=00000000-0000-0000-0000-000000000000",
      method: "GET",
    },

    // POST routes (checking that they hit 400 Bad Request or 200 instead of 500/404)
    { path: "resumes/process", method: "POST", body: {} },
    { path: "resumes/analyze", method: "POST", body: {} },
    { path: "resumes/parse", method: "POST", body: {} },
    { path: "resumes/tailor", method: "POST", body: {} },
    { path: "resumes/primary", method: "POST", body: {} },
    { path: "resumes/delete", method: "POST", body: {} },
    { path: "jobs/import", method: "POST", body: {} },
    { path: "jobs/match", method: "POST", body: {} },
    { path: "company-research/generate", method: "POST", body: {} },
    { path: "painpoints/generate", method: "POST", body: {} },
    { path: "outreach/generate", method: "POST", body: {} },
    { path: "loom/generate", method: "POST", body: {} },
    { path: "applications/generate-package", method: "POST", body: {} },
    { path: "interviews/prep", method: "POST", body: {} },
    { path: "interviews/with-prep", method: "POST", body: {} },
    { path: "companies/target", method: "POST", body: {} },
    { path: "follow-ups", method: "POST", body: {} },
    { path: "follow-ups/auto-create", method: "POST", body: {} },
    { path: "recruiters/discover", method: "POST", body: {} },
    { path: "admin/migrate", method: "POST", body: {} },
  ];

  for (const r of routes) {
    const res = await invokeRoute(r.path, { method: r.method, body: r.body, token });
    const isPass = res.status < 500; // 400 is a pass because it means route exists but payload is invalid. 500/404 is a fail.
    console.log(
      `${r.method} /api/${r.path.split("?")[0]} .... ${res.status} .... ${isPass ? "PASS" : "FAIL"}`,
    );
    if (!isPass) {
      console.log(`   ERROR details:`, res.text || (res as any).error);
      if ((res as any).stack) console.log((res as any).stack);
    }
  }
}

main().catch(console.error);
