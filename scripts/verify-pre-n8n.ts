import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { readFileSync, createWriteStream } from "node:fs";
import { pathToFileURL } from "node:url";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun } from "docx";
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
const ORIGINAL_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const blockers: string[] = [];
const createdStoragePaths: Array<{ bucket: string; path: string }> = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  const prefix = ok ? "PASS" : "FAIL";
  console.log(`${prefix}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function createSampleFiles(baseDir: string) {
  const sampleText = [
    "Jane Engineer",
    "jane.engineer@example.com",
    "+91 9876543210",
    "Skills: TypeScript, React, Supabase, Node.js, PostgreSQL",
    "Experience: Built production career systems and automation workflows.",
    "Projects: Career Compass Pro, Resume Intelligence Engine",
    "Education: B.Tech in Computer Science",
    "Certifications: AWS Certified Developer",
  ].join("\n");

  const latexTemplate = [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\section*{Jane Engineer}",
    "jane.engineer@example.com \\\\",
    "+91 9876543210 \\\\",
    "\\subsection*{Skills}",
    "TypeScript, React, Supabase, Node.js, PostgreSQL",
    "\\subsection*{Experience}",
    "Built production career systems and automation workflows.",
    "\\subsection*{Projects}",
    "Career Compass Pro, Resume Intelligence Engine",
    "\\subsection*{Education}",
    "B.Tech in Computer Science",
    "\\subsection*{Certifications}",
    "AWS Certified Developer",
    "\\end{document}"
  ].join("\n");

  const texPath = path.join(baseDir, "resume.tex");
  await fs.writeFile(texPath, latexTemplate, "utf-8");

  const docxPath = path.join(baseDir, "resume.docx");
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: sampleText.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] })),
      },
    ],
  });
  await fs.writeFile(docxPath, await Packer.toBuffer(doc));

  const pdfPath = path.join(baseDir, "resume.pdf");
  await new Promise<void>((resolve, reject) => {
    const pdf = new PDFDocument();
    const stream = createWriteStream(pdfPath);
    pdf.pipe(stream);
    pdf.fontSize(12);
    sampleText.split("\n").forEach((line) => pdf.text(line));
    pdf.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { sampleText, texPath, docxPath, pdfPath };
}

async function startWebhookServer() {
  const received: any[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        received.push({
          headers: req.headers,
          body: JSON.parse(Buffer.concat(chunks).toString("utf-8")),
        });
      } catch {
        received.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf-8") });
      }
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to start webhook server.");
  return {
    targetUrl: `http://127.0.0.1:${address.port}/hook`,
    received,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function invokeRoute(routePath: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> }) {
  const mod = await import(pathToFileUrl(path.resolve(process.cwd(), "api/[...route].ts")).href);
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

  const ROUTE_TIMEOUT = 60000;
  try {
    const response = await Promise.race([
      handler.fetch(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`invokeRoute timeout after ${ROUTE_TIMEOUT / 1000}s for ${normalizedPath}`)), ROUTE_TIMEOUT)),
    ]);
    const text = await (response as Response).text();
    return {
      ok: (response as Response).ok,
      status: (response as Response).status,
      data: safeJson(text),
      raw: text,
    };
  } catch (error: any) {
    if (error instanceof Response) {
      const text = await error.text();
      return { ok: error.ok, status: error.status, data: safeJson(text), raw: text };
    }
    return { ok: false, status: 500, data: { error: error?.message ?? String(error) }, raw: String(error?.message ?? error) };
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function pathToFileUrl(filePath: string) {
  return pathToFileURL(filePath);
}

async function tableExists(table: string) {
  const { error } = await admin.from(table as any).select("*").limit(1);
  return !error || !/relation .* does not exist|Could not find the table/i.test(error.message);
}

async function uploadFile(client: ReturnType<typeof createClient>, bucket: string, storagePath: string, filePath: string, contentType: string) {
  const buffer = await fs.readFile(filePath);
  const { error } = await client.storage.from(bucket).upload(storagePath, buffer, {
    upsert: true,
    contentType,
  });
  if (error) throw error;
  createdStoragePaths.push({ bucket, path: storagePath });
}

async function cleanupUser(userId?: string) {
  if (!userId) return;
  for (const bucket of ["resumes", "tailored-resumes"]) {
    const paths = createdStoragePaths.filter((item) => item.bucket === bucket).map((item) => item.path);
    if (paths.length) {
      await admin.storage.from(bucket).remove(paths);
    }
  }
  await admin.auth.admin.deleteUser(userId);
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "career-compass-pre-n8n-"));
  const files = await createSampleFiles(tempDir);
  const webhook = await startWebhookServer();
  const email = `pre-n8n-${Date.now()}@example.com`;
  const password = "CareerCompass#123";
  let userId: string | undefined;

  try {
    const authFail = await invokeRoute("/api/analytics/summary", { method: "GET" });
    record("Unauthorized request rejected", authFail.status === 401, `status=${authFail.status}`);

    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Pre N8N Tester" },
    });
    if (createdUser.error || !createdUser.data.user) throw new Error(createdUser.error?.message ?? "Failed to create temp user.");
    userId = createdUser.data.user.id;

    const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const signedIn = await authClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw new Error(signedIn.error?.message ?? "Failed to sign in temp user.");
    const token = signedIn.data.session.access_token;

    record("Auth compatibility", !!token, "Signed in with Supabase password auth.");

    const { data: alertPrefs, error: alertPrefsError } = await admin.from("alert_preferences").select("id").eq("user_id", userId);
    record("Alert preference trigger", !alertPrefsError && (alertPrefs?.length ?? 0) === 1, alertPrefsError?.message ?? `rows=${alertPrefs?.length ?? 0}`);

    const webhookSub = await invokeRoute("/api/n8n/webhooks", {
      method: "POST",
      token,
      body: { eventType: "resume_uploaded", targetUrl: webhook.targetUrl, secret: "test-secret", enabled: true },
    });
    record("Webhook subscription API", webhookSub.ok, webhookSub.ok ? "Subscription created." : webhookSub.raw);

    const { data: webhookRows, error: webhookRowsError } = await admin.from("n8n_webhook_subscriptions").select("id").eq("user_id", userId);
    record("Webhook subscription persistence", !webhookRowsError && (webhookRows?.length ?? 0) === 1, webhookRowsError?.message ?? `rows=${webhookRows?.length ?? 0}`);

    const resumeTypes = [
      { label: "TEX", filePath: files.texPath, fileName: "resume.tex", contentType: "text/x-tex" },
      { label: "DOCX", filePath: files.docxPath, fileName: "resume.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { label: "PDF", filePath: files.pdfPath, fileName: "resume.pdf", contentType: "application/pdf" },
    ];

    const resumeIds: string[] = [];
    for (const [index, resumeType] of resumeTypes.entries()) {
      const storagePath = `${userId}/verification/${Date.now()}-${resumeType.fileName}`;
      await uploadFile(authClient, "resumes", storagePath, resumeType.filePath, resumeType.contentType);
      const processResult = await invokeRoute("/api/resumes/process", {
        method: "POST",
        token,
        body: {
          title: `${resumeType.label} Resume`,
          description: `Verification upload for ${resumeType.label}`,
          isPrimary: index === 0,
          storagePath,
          fileName: resumeType.fileName,
          fileType: resumeType.contentType,
          fileSizeBytes: (await fs.stat(resumeType.filePath)).size,
        },
      });
      record(`Resume upload ${resumeType.label}`, processResult.ok, processResult.ok ? "Upload + parse succeeded." : processResult.raw);
      if (processResult.ok) {
        resumeIds.push(processResult.data.resume.id);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
    record("Webhook delivery", webhook.received.length > 0, webhook.received.length > 0 ? `received=${webhook.received.length}` : "No webhook payload received.");

    const { data: parses, error: parseError } = await admin.from("resume_parses" as any).select("*").eq("user_id", userId);
    record("Resume parser persistence", !parseError && (parses?.length ?? 0) >= 3, parseError?.message ?? `rows=${parses?.length ?? 0}`);

    const { data: versions, error: versionError } = await admin.from("resume_versions").select("*").eq("user_id", userId);
    record("Resume version persistence", !versionError && (versions?.length ?? 0) >= 3, versionError?.message ?? `rows=${versions?.length ?? 0}`);

    const refreshedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    await refreshedClient.auth.setSession({
      access_token: signedIn.data.session.access_token,
      refresh_token: signedIn.data.session.refresh_token,
    });
    const refreshedResumes = await refreshedClient.from("resumes").select("*");
    record("Refresh persistence", !refreshedResumes.error && (refreshedResumes.data?.length ?? 0) >= 3, refreshedResumes.error?.message ?? `rows=${refreshedResumes.data?.length ?? 0}`);

    const primaryResumeId = resumeIds[0];
    const sampleJobDescription = "We need a software engineer with TypeScript, React, Supabase, PostgreSQL, automation, and technical writing skills.";

    await admin.from("integrations").delete().eq("user_id", userId).eq("provider", "openrouter");
    delete process.env.OPENROUTER_API_KEY;
    const missingKey = await invokeRoute("/api/resumes/analyze", {
      method: "POST",
      token,
      body: { resumeId: primaryResumeId, jobDescription: sampleJobDescription },
    });
    record(
      "Missing OpenRouter key behavior",
      missingKey.ok || String(missingKey.raw).includes("OPENROUTER_API_KEY"),
      missingKey.ok ? `fallback_score=${missingKey.data.ats_score}` : `status=${missingKey.status}`,
    );

    if (ORIGINAL_OPENROUTER_KEY) {
      process.env.OPENROUTER_API_KEY = ORIGINAL_OPENROUTER_KEY;
    }
    const analyzeResult = await invokeRoute("/api/resumes/analyze", {
      method: "POST",
      token,
      body: { resumeId: primaryResumeId, jobDescription: sampleJobDescription },
    });
    record("ATS analysis", analyzeResult.ok, analyzeResult.ok ? `score=${analyzeResult.data.ats_score}` : analyzeResult.raw);

    const { data: analysisRows, error: analysisError } = await admin.from("resume_analyses").select("id").eq("user_id", userId);
    record("ATS persistence", !analysisError && (analysisRows?.length ?? 0) >= 2, analysisError?.message ?? `rows=${analysisRows?.length ?? 0}`);

    const tailorResult = await invokeRoute("/api/resumes/tailor", {
      method: "POST",
      token,
      body: { resumeId: primaryResumeId, jobDescription: sampleJobDescription },
    });
    record("Tailored resume generation", tailorResult.ok, tailorResult.ok ? "Tailored resume stored." : tailorResult.raw);

    const { data: tailoredRows, error: tailoredError } = await admin.from("tailored_resumes").select("id").eq("user_id", userId);
    record("Tailored resume persistence", !tailoredError && (tailoredRows?.length ?? 0) >= 1, tailoredError?.message ?? `rows=${tailoredRows?.length ?? 0}`);

    await admin.from("integrations").upsert({
      user_id: userId,
      provider: "openrouter",
      enabled: true,
      config: { api_key: ORIGINAL_OPENROUTER_KEY, default_model: "openai/gpt-4.1-mini" },
    });
    delete process.env.OPENROUTER_API_KEY;
    // 1. Mark Google as Normal Target
    await invokeRoute("/api/companies/target", {
      method: "POST",
      token,
      body: { companyName: "Google", targetValue: "normal" }
    });

    // 2. Verify gating blocks research for normal targets
    const normalGatingRes = await invokeRoute("/api/company-research/generate", {
      method: "POST",
      token,
      body: { companyName: "Google", website: "https://google.com" }
    });
    record("Gating blocks research for normal targets", !normalGatingRes.ok && normalGatingRes.status === 403, `status=${normalGatingRes.status}`);

    // 3. Mark Supabase as High Value Target
    await invokeRoute("/api/companies/target", {
      method: "POST",
      token,
      body: { companyName: "Supabase", targetValue: "high" }
    });

    // 4. Run research for High Value Target
    const integrationKeyResearch = await invokeRoute("/api/company-research/generate", {
      method: "POST",
      token,
      body: { companyName: "Supabase", website: "https://supabase.com" },
    });
    record("Valid OpenRouter user integration behavior", integrationKeyResearch.ok, integrationKeyResearch.ok ? "User-level OpenRouter config worked." : integrationKeyResearch.raw);
    if (ORIGINAL_OPENROUTER_KEY) process.env.OPENROUTER_API_KEY = ORIGINAL_OPENROUTER_KEY;

    const importCandidates = [
      { source: "lever", site: "leverdemo" },
      { source: "ashby", boardUrl: "https://jobs.ashbyhq.com/assemblyai" },
      { source: "greenhouse", boardToken: "stripe" },
    ];
    let importedJobCount = 0;
    let importedJob: any = null;
    for (const candidate of importCandidates) {
      const importResult = await invokeRoute("/api/jobs/import", { method: "POST", token, body: { sources: [candidate] } });
      if (importResult.ok && importResult.data.importedCount > 0) {
        importedJobCount = importResult.data.importedCount;
        importedJob = importResult.data.jobs?.[0] ?? null;
        record(`Job import ${candidate.source}`, true, `imported=${importedJobCount}`);
        break;
      }
    }
    if (!importedJob) {
      record("Job import", false, "No external job source returned data.");
      blockers.push("External job sources need manual verification or different source seeds.");
    }

    const { data: importRunRows, error: importRunError } = await admin.from("job_import_runs").select("id").eq("user_id", userId);
    record("Job import run persistence", !importRunError && (importRunRows?.length ?? 0) >= 1, importRunError?.message ?? `rows=${importRunRows?.length ?? 0}`);

    let jobId = importedJob?.id as string | undefined;
    if (!jobId) {
      const insertedJob = await admin.from("jobs").insert({
        user_id: userId,
        title: "Automation Engineer",
        company_name: "Supabase",
        source: "manual",
        description: sampleJobDescription,
        status: "open",
        priority: "medium",
      }).select("*").single();
      if (insertedJob.error || !insertedJob.data) throw new Error(insertedJob.error?.message ?? "Failed to create fallback job.");
      jobId = insertedJob.data.id;
    }

    const matchResult = await invokeRoute("/api/jobs/match", {
      method: "POST",
      token,
      body: { jobId, resumeId: primaryResumeId },
    });
    record("Job matching", matchResult.ok, matchResult.ok ? `score=${matchResult.data.score}` : matchResult.raw);

    const supabaseJob = await admin.from("jobs").insert({
      user_id: userId,
      title: "Platform Engineer",
      company_name: "Supabase",
      source: "manual",
      description:
        "Build TypeScript tooling, improve Supabase developer experience, own PostgreSQL workflows, and automate developer operations.",
      status: "open",
      priority: "high",
    }).select("*").single();
    if (!supabaseJob.error && supabaseJob.data) {
      const painResult = await invokeRoute("/api/painpoints/generate", {
        method: "POST",
        token,
        body: { companyName: "Supabase" },
      });
      record("Pain point generation", painResult.ok, painResult.ok ? `rows=${painResult.data.painPoints?.length ?? 0}` : painResult.raw);
    }

    record("Company research", integrationKeyResearch.ok, integrationKeyResearch.ok ? "Research stored." : integrationKeyResearch.raw);

    const outreachResult = await invokeRoute("/api/outreach/generate", {
      method: "POST",
      token,
      body: { type: "cold_email", companyName: "Supabase", resumeId: primaryResumeId },
    });
    record("Outreach generation", outreachResult.ok, outreachResult.ok ? "Draft stored." : outreachResult.raw);

    const loomResult = await invokeRoute("/api/loom/script", {
      method: "POST",
      token,
      body: { companyName: "Supabase", resumeId: primaryResumeId },
    });
    record("Loom script generation", loomResult.ok, loomResult.ok ? "Script stored." : loomResult.raw);

    const { data: loomRows, error: loomError } = await admin.from("loom_scripts").select("id").eq("user_id", userId);
    record("Loom script persistence", !loomError && (loomRows?.length ?? 0) >= 1, loomError?.message ?? `rows=${loomRows?.length ?? 0}`);

    const applicationInsert = await admin.from("applications").insert({
      user_id: userId,
      company_name: "Supabase",
      role_title: "Platform Engineer",
      status: "applied",
      source: "verification",
    }).select("*").single();
    if (!applicationInsert.error && applicationInsert.data) {
      await admin.from("interviews").insert({
        user_id: userId,
        application_id: applicationInsert.data.id,
        company_name: "Supabase",
        role_title: "Platform Engineer",
        scheduled_at: new Date().toISOString(),
        status: "scheduled",
      });
      await admin.from("assessments").insert({
        user_id: userId,
        application_id: applicationInsert.data.id,
        title: "Take-home",
        status: "pending",
      });
    }

    const analyticsSummary = await invokeRoute("/api/analytics/summary", { method: "GET", token });
    record("Analytics summary", analyticsSummary.ok, analyticsSummary.ok ? `applications=${analyticsSummary.data.applications}` : analyticsSummary.raw);

    const dailySummary = await invokeRoute("/api/analytics/daily-summary", { method: "POST", token });
    record("Daily summary generation", dailySummary.ok, dailySummary.ok ? "Summary stored." : dailySummary.raw);

    const eventsList = await invokeRoute("/api/n8n/events", { method: "GET", token });
    record("Event layer", eventsList.ok, eventsList.ok ? `events=${Array.isArray(eventsList.data) ? eventsList.data.length : 0}` : eventsList.raw);

    const { data: queueRows, error: queueError } = await admin.from("notification_queue").select("id").eq("user_id", userId);
    record("Notification queue trigger", !queueError && (queueRows?.length ?? 0) >= 1, queueError?.message ?? `rows=${queueRows?.length ?? 0}`);

    const webhookList = await invokeRoute("/api/n8n/webhooks", { method: "GET", token });
    record("Webhook layer", webhookList.ok, webhookList.ok ? `subscriptions=${Array.isArray(webhookList.data) ? webhookList.data.length : 0}` : webhookList.raw);

    const { data: storageProbe } = await admin.storage.from("resumes").list(`${userId}/verification`);
    record("Storage persistence", Array.isArray(storageProbe) && storageProbe.length >= 3, `files=${storageProbe?.length ?? 0}`);

    const { data: aiRows, error: aiError } = await admin
      .from("ai_generations")
      .select("id,kind")
      .eq("user_id", userId)
      .in("kind", ["resume_parse", "resume_analysis", "tailored_resume", "loom_script"]);
    record("Fallback AI persistence inactive", !aiError && (aiRows?.length ?? 0) === 0, aiError?.message ?? `rows=${aiRows?.length ?? 0}`);
  } finally {
    await webhook.close();
    await cleanupUser(userId);
    if (ORIGINAL_OPENROUTER_KEY) process.env.OPENROUTER_API_KEY = ORIGINAL_OPENROUTER_KEY;
  }

  const failed = checks.filter((check) => !check.ok);
  console.log("\nSummary");
  console.log(JSON.stringify({ failed: failed.length, checks, blockers }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
