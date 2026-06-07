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
const EMAIL = "chauhandigvijay121@gmail.com"; // Let's get the email of the persistent test user or verify it

async function invokeRoute(
  routePath: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> },
) {
  const mod = await import(pathToFileURL(path.resolve(process.cwd(), "api/[...route].ts")).href);
  const handler = mod.default;
  const headers = new Headers(init.headers ?? {});
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const normalizedPath = routePath.startsWith("/api/")
    ? routePath
    : `/api/${routePath.replace(/^\/+/, "")}`;
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

async function getRowCounts() {
  const { count: expCount } = await admin
    .from("experiences")
    .select("*", { count: "exact", head: true })
    .eq("user_id", USER_ID);
  const { count: eduCount } = await admin
    .from("education")
    .select("*", { count: "exact", head: true })
    .eq("user_id", USER_ID);
  const { count: projCount } = await admin
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", USER_ID);
  return { experiences: expCount ?? 0, education: eduCount ?? 0, projects: projCount ?? 0 };
}

async function main() {
  console.log("=== CANDIDATE BRAIN TEST ===");

  // 1. Get user details or create custom token for USER_ID
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(USER_ID);
  if (userError || !userData.user) {
    throw new Error(`Failed to get persistent test user: ${userError?.message}`);
  }

  // Force update user password to a known value
  console.log("Resetting persistent test user's password...");
  const { error: resetErr } = await admin.auth.admin.updateUserById(USER_ID, {
    password: "CareerCompass#123",
  });
  if (resetErr) {
    throw new Error(`Failed to reset password: ${resetErr.message}`);
  }

  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const signInRes = await authClient.auth.signInWithPassword({
    email: userData.user.email ?? EMAIL,
    password: "CareerCompass#123",
  });
  if (signInRes.error || !signInRes.data.session) {
    throw new Error(`Failed to sign in persistent test user: ${signInRes.error?.message}`);
  }
  const token = signInRes.data.session.access_token;
  console.log(`Signed in successfully! User: ${userData.user.email}`);

  // 3. Print Row Counts BEFORE
  const before = await getRowCounts();
  console.log("Before upload row counts:", before);

  // 4. Create sample resume LaTeX
  const latexTemplate = [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\section*{Jane Engineer}",
    "jane.engineer@example.com \\\\",
    "+91 9876543210 \\\\",
    "\\subsection*{Skills}",
    "TypeScript, React, Supabase, Node.js, PostgreSQL",
    "\\subsection*{Experience}",
    "Built production career systems and automation workflows at BreadButter.",
    "Worked as Lead Engineer on cloud scalability and developer operations.",
    "\\subsection*{Projects}",
    "Career Compass Pro: Resume intelligence engine and job matching tool.",
    "Valtrexa: Autonomous platform logic with n8n workflow integration.",
    "\\subsection*{Education}",
    "B.Tech in Computer Science from IIT Delhi.",
    "AWS Certified Solutions Architect certification.",
    "\\end{document}",
  ].join("\n");

  // 5. Upload file directly to Supabase storage resumes bucket
  const storagePath = `${USER_ID}/resumes/${Date.now()}-resume.tex`;
  const uploadRes = await admin.storage
    .from("resumes")
    .upload(storagePath, Buffer.from(latexTemplate), {
      contentType: "text/x-tex",
      upsert: true,
    });
  if (uploadRes.error) {
    throw new Error(`Failed to upload resume to storage: ${uploadRes.error.message}`);
  }
  console.log("Resume uploaded to storage successfully path:", storagePath);

  // 6. Call API /api/resumes/process
  console.log("Calling /api/resumes/process...");
  const processRes = await invokeRoute("/api/resumes/process", {
    method: "POST",
    token,
    body: {
      title: "My LaTeX Resume",
      storagePath,
      fileName: "resume.tex",
      fileType: "tex",
      fileSizeBytes: latexTemplate.length,
      isPrimary: true,
    },
  });

  if (!processRes.ok) {
    console.error("API process failed:", processRes.status, processRes.data || processRes.raw);
  } else {
    console.log(
      "API process succeeded! Parse data:",
      JSON.stringify(processRes.data?.parse, null, 2),
    );
  }

  // 7. Print Row Counts AFTER
  const after = await getRowCounts();
  console.log("After upload row counts:", after);
}

main().catch(console.error);
