import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
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
    if (!process.env[key]) process.env[key] = value;
  }
  return env;
}

const env = loadDotEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PUBLISHABLE_KEY = env.SUPABASE_PUBLISHABLE_KEY;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function invokeRoute(
  routePath: string,
  init: { method?: string; body?: unknown; token?: string },
) {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "api/[...route].ts")).href);
  const headers = new Headers();
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const request = new Request(`http://localhost${routePath}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const response = await mod.default.fetch(request);
  const text = await response.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { ok: response.ok, status: response.status, data, raw: text };
}

async function main() {
  const email = `skills-check-${Date.now()}@example.com`;
  const password = "CareerCompass#123";

  const createdUser = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createdUser.error || !createdUser.data.user) throw createdUser.error;
  const userId = createdUser.data.user.id;
  console.log("User created:", userId);

  const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const signedIn = await authClient.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error;
  const token = signedIn.data.session.access_token;

  const sampleText = [
    "Jane Engineer",
    "jane.engineer@example.com",
    "Skills: TypeScript, React, Supabase, Node.js, PostgreSQL",
  ].join("\n");

  const storagePath = `${userId}/verification/${Date.now()}-resume.tex`;
  const upload = await authClient.storage
    .from("resumes")
    .upload(storagePath, Buffer.from(sampleText), {
      upsert: true,
      contentType: "text/x-tex",
    });
  if (upload.error) throw upload.error;

  console.log("Processing resume...");
  const processResult = await invokeRoute("/api/resumes/process", {
    method: "POST",
    token,
    body: {
      title: "Test Resume",
      isPrimary: true,
      storagePath,
      fileName: "resume.tex",
      fileType: "text/x-tex",
      fileSizeBytes: sampleText.length,
    },
  });
  console.log("Process result:", processResult.status, JSON.stringify(processResult.data));

  console.log("Checking skills table in DB...");
  const { data: dbSkills } = await admin.from("skills").select("*").eq("user_id", userId);
  console.log("DB Skills count:", dbSkills?.length);
  console.log("DB Skills:", dbSkills);

  // clean up
  await admin.storage.from("resumes").remove([storagePath]);
  await admin.auth.admin.deleteUser(userId);
}

main().catch(console.error);
