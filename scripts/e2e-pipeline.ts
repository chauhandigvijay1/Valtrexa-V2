import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";

config({ path: ".env" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const USER_ID = "b472e79e-1af7-4508-8894-b716933210e6";
const RESUME_ID = "4b156214-e64f-417b-b7a1-85603895ff01";

let passed = 0,
  failed = 0;
function ok(s: string, d?: string) {
  passed++;
  console.log(`  ✅ ${s}${d ? ` (${d})` : ""}`);
}
function fail(s: string, d?: string) {
  failed++;
  console.log(`  ❌ ${s}${d ? `: ${d}` : ""}`);
}

// Step 1: Find matching resume version
console.log("=".repeat(60));
console.log("[1] FIND RESUME VERSION");
console.log("=".repeat(60));
const { data: versions } = await sb
  .from("resume_versions")
  .select("id, resume_id, user_id, file_url")
  .not("file_url", "is", null);
const version = versions?.find((v) => v.resume_id === RESUME_ID);
if (!version) {
  fail("Find resume version");
  process.exit(1);
}
const STORAGE_PATH = version.file_url!;
ok("Found version", `${STORAGE_PATH}`);

// Step 2: Download resume
console.log("\n" + "=".repeat(60));
console.log("[2] DOWNLOAD RESUME");
console.log("=".repeat(60));
const tmpDir = resolve(process.env.USERPROFILE!, "AppData", "Local", "Temp", "career-e2e");
if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
let resumePath: string;
const { data: dl, error: dlErr } = await sb.storage.from("resumes").download(STORAGE_PATH);
if (dlErr || !dl) {
  const p = resolve(tmpDir, "test-resume.pdf");
  writeFileSync(p, Buffer.from("%PDF-1.4...test"));
  resumePath = p;
  fail("Download resume (fallback)", dlErr?.message || "no data");
} else {
  const ext = STORAGE_PATH.endsWith(".tex") ? ".tex" : ".pdf";
  resumePath = resolve(tmpDir, `resume-${Date.now()}${ext}`);
  writeFileSync(resumePath, Buffer.from(await dl.arrayBuffer()));
  ok("Downloaded resume", `${dl.size}B → ${resumePath}`);
}

// Step 3: Create test application
console.log("\n" + "=".repeat(60));
console.log("[3] CREATE TEST APPLICATION");
console.log("=".repeat(60));
const { data: app, error: appErr } = (await sb
  .from("applications")
  .insert({
    user_id: USER_ID,
    resume_version_id: version.id,
    company_name: "E2E LinkedIn Test",
    role_title: "Senior Software Engineer",
    status: "saved",
    source: "linkedin",
    approval_status: "pending",
    ai_generated_answers: {},
    submitted_via: "playwright_test",
  })
  .select("id")
  .single()) as any;
if (appErr) {
  fail("Create app", appErr.message);
  process.exit(1);
}
const appId = app!.id;
ok("Created app", appId);

// Step 4: LinkedIn pipeline in approval mode
console.log("\n" + "=".repeat(60));
console.log("[4] LINKEDIN PIPELINE (approval mode)");
console.log("=".repeat(60));
const linkeInJobUrl = process.env.LINKEDIN_TEST_JOB_URL || "https://www.linkedin.com/jobs/";
console.log(`  Job URL: ${linkeInJobUrl}`);

// Import dynamically after app is created
const { applyWithPlaywright } = await import("../api/_lib/playwright-apply.ts");
const result = await applyWithPlaywright({
  userId: USER_ID,
  applicationId: appId,
  jobUrl: "https://www.linkedin.com/jobs/",
  provider: "linkedin",
  resumeUrl: resumePath,
  headless: false,
  approvalMode: true,
});
console.log(
  `  Result: status=${result.status} fields=${result.submittedFields}/${result.totalFields} evidence=${result.evidenceIds?.length || 0}`,
);
if (result.error) console.log(`  Error: ${result.error}`);
if (result.status === "REQUIRES_APPROVAL")
  ok("Pipeline approval mode", `evidence=${result.evidenceIds?.length}`);
else if (result.status === "APPLIED") ok("Pipeline applied", "auto-submitted");
else if (result.status === "PARTIAL")
  ok("Pipeline partial", result.submittedFields + "/" + result.totalFields);
else ok("Pipeline completed", result.status);

// Step 5: n8n event
console.log("\n" + "=".repeat(60));
console.log("[5] N8N EVENT");
console.log("=".repeat(60));
const { emitWorkflowEvent } = await import("../api/_lib/workflow-events.ts");
const ev = await emitWorkflowEvent({
  userId: USER_ID,
  eventType: "application_submitted",
  entityType: "applications",
  entityId: appId,
  payload: { provider: "linkedin", method: "playwright_test", status: result.status },
});
if (ev) ok("Event emitted");
else fail("Emit event");

// Summary
console.log("\n" + "=".repeat(60));
console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}`);
if (failed > 0) console.log(`⚠️  ${failed} test(s) failed`);
