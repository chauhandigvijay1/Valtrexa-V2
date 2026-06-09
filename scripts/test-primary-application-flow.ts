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
    const value = trimmed.slice(eq + 1).trim().replace(/^"/, "").replace(/"$/, "");
    env[key] = value;
    if (!process.env[key]) process.env[key] = value;
  }
  return env;
}

const env = loadDotEnv();
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

async function main() {
  const email = `primary-flow-${Date.now()}@example.com`;
  const password = "CareerCompass#123";
  const resumeText = [
    "Jane Engineer",
    "jane.engineer@example.com",
    "+91 9876543210",
    "Bangalore, India",
    "Professional Summary: Product-minded software engineer with React, TypeScript, Supabase, and Node.js experience.",
    "Skills: TypeScript, React, Next.js, Node.js, PostgreSQL, Supabase, Playwright, Docker",
    "Projects:",
    "Career Compass Pro",
    "- Built an AI career operating system for resumes, applications, and recruiter outreach.",
    "- GitHub: https://github.com/example/career-compass-pro",
    "Experience:",
    "Full Stack Developer at BreadButter",
    "- Built production automation workflows and hiring dashboards.",
    "Education:",
    "B.Tech in Computer Science",
  ].join("\n");

  const createdUser = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Primary Flow Tester" },
  });
  if (createdUser.error || !createdUser.data.user) {
    throw new Error(createdUser.error?.message ?? "Failed to create temp user.");
  }
  const userId = createdUser.data.user.id;

  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const signedIn = await authClient.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(signedIn.error?.message ?? "Failed to sign in temp user.");
  }
  const token = signedIn.data.session.access_token;

  try {
    const storagePath = `${userId}/verification/${Date.now()}-resume.tex`;
    const upload = await authClient.storage.from("resumes").upload(storagePath, Buffer.from(resumeText), {
      upsert: true,
      contentType: "text/x-tex",
    });
    if (upload.error) throw upload.error;

    const processResult = await invokeRoute("/api/resumes/process", {
      method: "POST",
      token,
      body: {
        title: "Primary Resume",
        isPrimary: true,
        storagePath,
        fileName: "resume.tex",
        fileType: "text/x-tex",
        fileSizeBytes: resumeText.length,
      },
    });
    if (!processResult.ok) {
      throw new Error(JSON.stringify(processResult.data ?? processResult.raw));
    }

    const resumeId = processResult.data.resume.id;
    const versionId = processResult.data.version.id;

    const { data: candidateProfile } = await admin
      .from("candidate_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: skills } = await admin.from("skills").select("*").eq("user_id", userId);
    const { data: projects } = await admin.from("projects").select("*").eq("user_id", userId);

    const { data: job, error: jobError } = await admin
      .from("jobs")
      .insert({
        user_id: userId,
        title: "Platform Engineer",
        company_name: "Supabase",
        description:
          "We need a software engineer with TypeScript, React, Supabase, PostgreSQL, and automation experience.",
        status: "open",
        priority: "high",
        match_score: 88,
      })
      .select("*")
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Failed to create job.");

    const { data: application, error: applicationError } = await admin
      .from("applications")
      .insert({
        user_id: userId,
        job_id: job.id,
        company_name: "Supabase",
        role_title: "Platform Engineer",
        status: "applied",
        resume_version_id: versionId,
      })
      .select("*")
      .single();
    if (applicationError || !application) {
      throw new Error(applicationError?.message ?? "Failed to create application.");
    }

    const packageResult = await invokeRoute("/api/applications/generate-package", {
      method: "POST",
      token,
      body: {
        jobId: job.id,
        companyName: "Supabase",
        applicationId: application.id,
      },
    });
    if (!packageResult.ok) {
      throw new Error(JSON.stringify(packageResult.data ?? packageResult.raw));
    }

    const { data: applicationAfter } = await admin
      .from("applications")
      .select("*")
      .eq("id", application.id)
      .single();
    const { count: answersCount } = await admin
      .from("application_answers")
      .select("id", { count: "exact", head: true })
      .eq("application_id", application.id);
    const { count: tailoredCount } = await admin
      .from("tailored_resumes")
      .select("id", { count: "exact", head: true })
      .eq("resume_version_id", versionId);

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: {
            resumeProcessed: true,
            primaryResumeId: resumeId,
            candidateBrainAutoPopulated: !!candidateProfile,
            extractedSkills: skills?.map((skill) => ({
              name: skill.name,
              category: skill.category,
              level: skill.level,
            })),
            extractedProjects: projects?.map((project) => ({
              name: project.name,
              github_url: project.github_url,
              features: (project as any).features ?? null,
            })),
            applicationPackageGenerated: !!applicationAfter?.package_generated,
            assignedTier: applicationAfter?.tier ?? null,
            applicationAnswersCount: answersCount ?? 0,
            tailoredResumeCountForApplicationFlow: tailoredCount ?? 0,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
