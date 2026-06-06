import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1).replace(/^"/, "").replace(/"$/, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function invokeRoute(routePath: string, init: { method?: string; body?: unknown; token?: string }) {
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "career-compass-openrouter-"));
  const sampleText = [
    "Jane Engineer",
    "jane.engineer@example.com",
    "+91 9876543210",
    "Skills: TypeScript, React, Supabase, Node.js, PostgreSQL, Automation",
    "Experience: Built production career systems and automation workflows.",
  ].join("\n");
  const texPath = path.join(tempDir, "resume.tex");
  await fs.writeFile(texPath, sampleText, "utf-8");

  const email = `openrouter-check-${Date.now()}@example.com`;
  const password = "CareerCompass#123";
  let userId: string | undefined;
  let storagePath: string | undefined;

  try {
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createdUser.error || !createdUser.data.user) throw new Error(createdUser.error?.message ?? "Failed to create temp user.");
    userId = createdUser.data.user.id;

    const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const signedIn = await authClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw new Error(signedIn.error?.message ?? "Failed to sign in.");
    const token = signedIn.data.session.access_token;

    storagePath = `${userId}/verification/${Date.now()}-resume.tex`;
    const buffer = await fs.readFile(texPath);
    const upload = await authClient.storage.from("resumes").upload(storagePath, buffer, {
      upsert: true,
      contentType: "text/x-tex",
    });
    if (upload.error) throw upload.error;

    const processResult = await invokeRoute("/api/resumes/process", {
      method: "POST",
      token,
      body: {
        title: "OpenRouter Resume",
        description: "Targeted verification",
        isPrimary: true,
        storagePath,
        fileName: "resume.tex",
        fileType: "text/x-tex",
        fileSizeBytes: buffer.length,
      },
    });
    if (!processResult.ok) throw new Error(`Resume process failed: ${processResult.raw}`);
    const resumeId = processResult.data.resume.id;

    const analyze = await invokeRoute("/api/resumes/analyze", {
      method: "POST",
      token,
      body: {
        resumeId,
        jobDescription: "Build TypeScript, React, Supabase, PostgreSQL, automation, and developer tooling systems.",
      },
    });
    console.log(`ATS ${analyze.status} ${analyze.ok ? `OK score=${analyze.data.ats_score}` : analyze.raw}`);

    const loom = await invokeRoute("/api/loom/script", {
      method: "POST",
      token,
      body: {
        companyName: "Supabase",
        resumeId,
      },
    });
    console.log(`LOOM ${loom.status} ${loom.ok ? "OK" : loom.raw}`);

    if (!analyze.ok || !loom.ok) process.exitCode = 1;
  } finally {
    if (storagePath) {
      await admin.storage.from("resumes").remove([storagePath]).catch(() => undefined);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
