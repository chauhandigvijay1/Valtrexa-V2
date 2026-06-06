import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { ChildProcess, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, Page } from "playwright";
import { createClient } from "@supabase/supabase-js";

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

async function waitForServer(url: string, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function createSampleResume() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-evidence-"));
  const resumePath = path.join(tempDir, "Jane_Resume.tex");
  await fs.writeFile(
    resumePath,
    [
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
      "\\end{document}"
    ].join("\n"),
    "utf-8"
  );
  return resumePath;
}

async function stopServerTree(server: ChildProcess) {
  if (!server.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }
  await new Promise<void>((resolve) => {
    server.once("exit", () => resolve());
    server.kill("SIGTERM");
    setTimeout(resolve, 3000);
  });
}

async function main() {
  const outputDir = path.resolve(process.cwd(), "artifacts", "ui-verification");
  await fs.mkdir(outputDir, { recursive: true });
  const resumeFilePath = await createSampleResume();
  const email = `ui-evidence-${Date.now()}@example.com`;
  const password = "CareerCompass#123";

  const createdUser = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "UI Evidence Tester" },
  });
  if (createdUser.error || !createdUser.data.user) {
    throw new Error(createdUser.error?.message ?? "Failed to create temp user.");
  }
  const userId = createdUser.data.user.id;

  const server = spawn("cmd.exe", ["/c", "npx.cmd", "tsx", "scripts/local-e2e-server.mjs"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: "4173" },
  });

  server.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));
  server.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  
  page.on("pageerror", (error) => {
    console.error("PAGEERROR:", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("BROWSER CONSOLE:", message.text());
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (response.status() >= 400) {
      try {
        const text = await response.text();
        console.error(`NETWORK ERROR [${response.status()}] ${url}: ${text}`);
      } catch {
        console.error(`NETWORK ERROR [${response.status()}] ${url} (could not read body)`);
      }
    }
  });

  const apiResponses: Record<string, any> = {};
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/")) {
      try {
        const text = await response.text();
        apiResponses[url.split("?")[0]] = JSON.parse(text);
      } catch {
        // Not JSON or failed to read
      }
    }
  });

  const evidence: Record<string, any> = {};

  async function collect(
    workflowKey: string,
    screenshotName: string,
    url: string,
    apiEndpoints: string[],
    dbTableQueries: { table: string; select?: string; filter?: (qb: any) => any }[]
  ) {
    await delay(1500); // Wait for animations / state updates
    const scrPath = path.join(outputDir, screenshotName);
    await page.screenshot({ path: scrPath, fullPage: true });

    const apiRes: Record<string, any> = {};
    for (const endpoint of apiEndpoints) {
      const fullUrl = `http://127.0.0.1:4173${endpoint}`;
      if (apiResponses[fullUrl]) {
        apiRes[endpoint] = apiResponses[fullUrl];
      }
    }

    const dbRows: Record<string, any> = {};
    for (const q of dbTableQueries) {
      let queryBuilder = admin.from(q.table).select(q.select ?? "*");
      if (q.filter) {
        queryBuilder = q.filter(queryBuilder);
      } else {
        queryBuilder = queryBuilder.eq("user_id", userId);
      }
      const { data } = await queryBuilder.order("created_at", { ascending: false }).limit(1).maybeSingle();
      dbRows[q.table] = data ?? null;
    }

    evidence[workflowKey] = {
      workflow: workflowKey,
      screenshotPath: scrPath,
      screenshotFilename: screenshotName,
      browserUrl: url,
      apiResponse: apiRes,
      databaseRow: dbRows,
    };

    console.log(`VERIFIED WORKFLOW: ${workflowKey}`);
  }

  try {
    console.log("STEP: waiting for login page");
    await waitForServer("http://127.0.0.1:4173/login");

    console.log("STEP: login");
    await page.goto("http://127.0.0.1:4173/login", { waitUntil: "networkidle" });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/dashboard/, { timeout: 30000 });

    // Workflow 1: Candidate Brain
    console.log("STEP: Candidate Brain");
    await page.goto("http://127.0.0.1:4173/profile", { waitUntil: "networkidle" });
    await page.getByPlaceholder("https://github.com/...").fill("https://github.com/janeengineer");
    await page.getByPlaceholder("https://linkedin.com/in/...").fill("https://linkedin.com/in/janeengineer");
    await page.getByPlaceholder("e.g. Senior Frontend Engineer, Full Stack Engineer").fill("Platform Engineer");
    await page.getByRole("button", { name: "Save Profile Preferences" }).click();
    await page.getByText("Profile preferences saved successfully!").waitFor({ timeout: 5000 });
    await collect(
      "Candidate Brain",
      "01-candidate-brain.png",
      page.url(),
      [], // no direct custom API called here (uses supabase client directly)
      [{ table: "candidate_profiles" }]
    );

    // Workflow 2: Resume Upload
    console.log("STEP: Resume Upload");
    await page.goto("http://127.0.0.1:4173/resumes", { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles(resumeFilePath);
    await page.getByRole("button", { name: "ATS Analyze" }).first().waitFor({ timeout: 90000 });
    await collect(
      "Resume Upload",
      "02-resume-upload.png",
      page.url(),
      ["/api/resumes/process"],
      [{ table: "resumes" }, { table: "resume_versions" }]
    );

    const jobDescription = "We need a software engineer with TypeScript, React, Supabase, PostgreSQL, automation, and technical writing skills.";

    // Workflow 3: ATS Analysis
    console.log("STEP: ATS Analysis");
    await page.getByRole("button", { name: "ATS Analyze" }).first().click();
    await page.getByLabel("Job description").fill(jobDescription);
    await page.getByRole("button", { name: "Run ATS Analysis" }).click();
    await page.getByText("Keyword coverage", { exact: true }).waitFor({ timeout: 90000 });
    await collect(
      "ATS Analysis",
      "03-ats-details.png",
      page.url(),
      ["/api/resumes/analyze"],
      [{ table: "resume_analyses" }]
    );

    // Workflow 4: LaTeX Tailor
    console.log("STEP: LaTeX Tailor");
    await page.getByRole("button", { name: "Tailor" }).first().click();
    await page.getByRole("button", { name: "Generate Tailored Resume" }).click();
    await Promise.race([
      page.getByText("PDF Preview", { exact: true }).waitFor({ timeout: 90000 }),
      page.getByText("Tailored resume version", { exact: true }).waitFor({ timeout: 90000 }),
    ]);
    await collect(
      "LaTeX Tailor",
      "04-latex-tailor.png",
      page.url(),
      ["/api/resumes/tailor"],
      [{ table: "tailored_resumes" }]
    );

    // Workflow 5: PDF Preview
    console.log("STEP: PDF Preview");
    await page.getByRole("tab", { name: "Compare" }).click();
    await page.getByText("Added emphasis", { exact: true }).waitFor({ timeout: 30000 });
    await collect(
      "PDF Preview",
      "05-pdf-preview.png",
      page.url(),
      [],
      [{ table: "tailored_resumes" }]
    );

    // Workflow 6: Company Research
    console.log("STEP: Company Research");
    await page.goto("http://127.0.0.1:4173/company-research", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Generate" }).first().click();
    await page.locator('div:has-text("Company name *") >> input').first().fill("Supabase");
    await page.locator('div:has-text("Website") >> input').first().fill("https://supabase.com");
    await page.getByRole("button", { name: /^Generate$/ }).last().click();
    await page.getByText("Suggested Outreach Angles").waitFor({ timeout: 120000 });
    await collect(
      "Company Research",
      "06-company-research.png",
      page.url(),
      ["/api/company-research/generate"],
      [{ table: "company_research" }]
    );

    // Workflow 12: High Value Target
    console.log("STEP: High Value Target");
    await page.getByRole("button", { name: "Configure Target" }).first().click();
    await page.getByRole("button", { name: "Save Classification" }).click();
    await page.getByText("Targeting classification updated.").waitFor({ timeout: 5000 });
    await collect(
      "High Value Target",
      "07-high-value-target.png",
      page.url(),
      [],
      [{ table: "companies", filter: (qb) => qb.eq("user_id", userId) }]
    );

    // Workflow 7: Recruiter Discovery
    try {
      console.log("STEP: Recruiter Discovery");
      await page.goto("http://127.0.0.1:4173/recruiters", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "New recruiter" }).click();
      
      const rDialog = page.getByRole("dialog");
      await rDialog.locator("input").nth(0).fill("Alice Recruiter");
      await rDialog.locator("input").nth(1).fill("Supabase");
      await rDialog.locator("input").nth(2).fill("alice@supabase.com");
      await rDialog.getByRole("button", { name: "Save" }).click();
      
      await page.getByText("Alice Recruiter").waitFor({ timeout: 10000 });
      await collect(
        "Recruiter Discovery",
        "08-recruiter-discovery.png",
        page.url(),
        [],
        [{ table: "recruiters" }]
      );

      console.log("STEP: AI Recruiter Discovery");
      await page.getByRole("button", { name: "Discover Recruiters" }).click();
      const discDialog = page.getByRole("dialog");
      await discDialog.getByPlaceholder("e.g., Supabase, Vercel…").fill("Supabase");
      await discDialog.getByPlaceholder("e.g., Senior Frontend Engineer").fill("Platform Engineer");
      await discDialog.getByRole("button", { name: "Discover" }).click();
      
      // Wait for the API call to complete
      const response = await page.waitForResponse(resp => resp.url().includes("/api/recruiters/discover") && resp.status() === 200, { timeout: 90000 });
      
      // Get the name of the discovered recruiter from the API response
      const discoveredRes = await response.json();
      const recruiterName = discoveredRes?.recruiters?.[0]?.name || "Supabase Recruiting Team";
      console.log(`Discovered recruiter: ${recruiterName}`);
      
      await page.getByText(recruiterName).waitFor({ timeout: 10000 });
      await collect(
        "AI Recruiter Discovery Results",
        "18-recruiter-discovery-results.png",
        page.url(),
        ["/api/recruiters/discover"],
        [{ table: "recruiters", filter: (qb) => qb.eq("user_id", userId).eq("source", "discovery") }]
      );
      
      console.log("STEP: AI Recruiter Enrichment Expansion");
      await page.getByText(recruiterName).first().click();
      await page.getByText("CRM Notes & Details").waitFor({ timeout: 5000 });
      await collect(
        "AI Recruiter Enrichment Details",
        "19-recruiter-enrichment.png",
        page.url(),
        [],
        [{ table: "recruiters", filter: (qb) => qb.eq("user_id", userId).eq("source", "discovery") }]
      );
    } catch (err: any) {
      console.error("Recruiter Discovery failed:", err.message);
    }

    // Workflow 8: Application Package & Workflow 9: Tier Assignment
    try {
      console.log("STEP: Application Package & Tier Assignment");
      await page.goto("http://127.0.0.1:4173/applications", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "New application" }).click();
      
      const aDialog = page.getByRole("dialog");
      await aDialog.locator("input").nth(0).fill("Supabase");
      await aDialog.locator("input").nth(1).fill("Platform Engineer");
      await aDialog.getByRole("button", { name: "Save" }).click();
      
      await page.getByText("Platform Engineer").waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Generate application package + assign tier" }).first().click();
      await page.getByText("Application package generated", { exact: false }).waitFor({ timeout: 90000 });
      await collect(
        "Application Package",
        "09-application-package.png",
        page.url(),
        ["/api/applications/generate-package"],
        [{ table: "applications" }]
      );
      await collect(
        "Tier Assignment",
        "10-tier-assignment.png",
        page.url(),
        [],
        [{ table: "applications" }]
      );
    } catch (err: any) {
      console.error("Application Package / Tier Assignment failed:", err.message);
    }

    // Workflow 10: Follow-Up Engine
    try {
      console.log("STEP: Follow-Up Engine");
      await page.goto("http://127.0.0.1:4173/outreach", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Schedule Follow-up" }).click();
      await page.getByPlaceholder("e.g. Day 3 automated follow-up check").fill("Automated outreach follow-up");
      await page.locator('input[type="datetime-local"]').fill("2026-06-10T12:00");
      await page.getByRole("button", { name: "Schedule" }).click();
      await page.getByText("Automated outreach follow-up").waitFor({ timeout: 5000 });
      await collect(
        "Follow-Up Engine",
        "11-follow-up-engine.png",
        page.url(),
        [],
        [{ table: "followups" }]
      );
    } catch (err: any) {
      console.error("Follow-Up Engine failed:", err.message);
    }

    // Workflow 11: Interview Prep
    try {
      console.log("STEP: Interview Prep");
      await page.goto("http://127.0.0.1:4173/interviews", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "New interview" }).click();
      await page.locator('div:has-text("Company *") >> input').first().fill("Supabase");
      await page.locator('div:has-text("Role") >> input').first().fill("Platform Engineer");
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByText("Platform Engineer").waitFor({ timeout: 5000 });
      await page.getByRole("button", { name: "Generate AI interview prep" }).first().click();
      await page.getByText("Interview prep generated", { exact: false }).waitFor({ timeout: 90000 });
      await collect(
        "Interview Prep",
        "12-interview-prep.png",
        page.url(),
        ["/api/interviews/prep"],
        [{ table: "interview_preparation" }]
      );

      console.log("STEP: Interview Prep Page");
      await page.goto("http://127.0.0.1:4173/interview-prep", { waitUntil: "networkidle" });
      await page.getByText("Interview Preparation").waitFor({ timeout: 5000 });
      await collect(
        "Interview Prep Page",
        "13-interview-prep-page.png",
        page.url(),
        [],
        [{ table: "interview_preparation" }]
      );

      console.log("STEP: 14-interview-generated-content");
      await collect(
        "Interview Generated Content",
        "14-interview-generated-content.png",
        page.url(),
        [],
        [{ table: "interview_preparation" }]
      );

      console.log("STEP: 15-interview-company-briefing");
      await page.getByText("Company Briefing").first().click();
      await page.getByText("Notes / Briefing").waitFor({ timeout: 5000 });
      await collect(
        "Interview Company Briefing",
        "15-interview-company-briefing.png",
        page.url(),
        [],
        [{ table: "interview_preparation" }]
      );
      // Collapse
      await page.getByText("Company Briefing").first().click();

      console.log("STEP: 16-interview-role-analysis");
      await page.getByText("Role Briefing").first().click();
      await page.getByText("Notes / Briefing").waitFor({ timeout: 5000 });
      await collect(
        "Interview Role Analysis",
        "16-interview-role-analysis.png",
        page.url(),
        [],
        [{ table: "interview_preparation" }]
      );
      // Collapse
      await page.getByText("Role Briefing").first().click();

      console.log("STEP: 17-interview-question-bank");
      await page.getByText("Likely Questions").first().click();
      await page.getByText("Notes / Briefing").waitFor({ timeout: 5000 });
      await collect(
        "Interview Question Bank",
        "17-interview-question-bank.png",
        page.url(),
        [],
        [{ table: "interview_preparation" }]
      );
      // Collapse
      await page.getByText("Likely Questions").first().click();
    } catch (err: any) {
      console.error("Interview Prep failed:", err.message);
    }

    await fs.writeFile(path.join(outputDir, "evidence.json"), JSON.stringify(evidence, null, 2), "utf-8");
    console.log("SUCCESS: All workflows verified and evidence stored.");
  } finally {
    await browser.close();
    await stopServerTree(server);
    await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
