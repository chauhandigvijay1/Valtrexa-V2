import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { ChildProcess, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "valtrexa-ui-flow-"));
  const resumePath = path.join(tempDir, "Valtrexa_UI_Resume.tex");
  await fs.writeFile(
    resumePath,
    [
      "Jane Engineer",
      "jane.engineer@example.com",
      "+91 9876543210",
      "Skills: TypeScript, React, Supabase, Node.js, PostgreSQL, automation, technical writing",
      "Experience: Built production career systems and outreach workflows.",
      "Projects: Valtrexa, Resume Intelligence Center",
      "Education: B.Tech in Computer Science",
    ].join("\n"),
    "utf-8",
  );
  return resumePath;
}

async function take(page: import("playwright").Page, outputDir: string, name: string) {
  const filePath = path.join(outputDir, name);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`SCREENSHOT: ${filePath}`);
  return filePath;
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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variables.");
  }

  const outputDir = path.resolve(process.cwd(), "artifacts", "ui-verification");
  await fs.mkdir(outputDir, { recursive: true });
  const resumePath = await createSampleResume();
  const email = `ui-flow-${Date.now()}@example.com`;
  const password = "CareerCompass#123";

  const createdUser = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "UI Flow Tester" },
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

  try {
    console.log("STEP: waiting for login page");
    await waitForServer("http://127.0.0.1:4173/login");

    console.log("STEP: login");
    await page.goto("http://127.0.0.1:4173/login", { waitUntil: "networkidle" });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/dashboard/, { timeout: 30000 });

    console.log("STEP: resume upload");
    await page.goto("http://127.0.0.1:4173/resumes", { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles(resumePath);
    await page.getByRole("button", { name: "ATS Analyze" }).first().waitFor({ timeout: 30000 });
    await take(page, outputDir, "01-resume-upload.png");

    const jobDescription =
      "We need a software engineer with TypeScript, React, Supabase, PostgreSQL, automation, and technical writing skills for product delivery.";

    console.log("STEP: ats analysis");
    await page.getByRole("button", { name: "ATS Analyze" }).first().click();
    await page.getByLabel("Job description").fill(jobDescription);
    await page.getByRole("button", { name: "Run ATS Analysis" }).click();
    await page.getByText("Keyword coverage", { exact: true }).waitFor({ timeout: 90000 });
    await page.getByText("Recommendations", { exact: true }).waitFor({ timeout: 90000 });
    await take(page, outputDir, "02-ats-details.png");

    console.log("STEP: tailored resume");
    await page.getByRole("button", { name: "Tailor" }).first().click();
    const tailoredJobDescription = await page.getByLabel("Job description").inputValue();
    if (tailoredJobDescription.trim() !== jobDescription) {
      throw new Error("Tailored resume dialog did not reuse the latest ATS job description.");
    }
    await page.getByRole("button", { name: "Generate Tailored Resume" }).click();
    await page.getByText("Tailored resume version", { exact: true }).waitFor({ timeout: 90000 });
    await page.getByRole("tab", { name: "Compare" }).click();
    await page.getByText("Added emphasis", { exact: true }).waitFor({ timeout: 30000 });
    await take(page, outputDir, "03-tailored-preview.png");

    console.log("STEP: job match");
    await page.goto("http://127.0.0.1:4173/opportunities", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "New job" }).click();
    await page.getByLabel("Title *").fill("Platform Engineer");
    await page.getByLabel("Company").fill("Supabase");
    await page.getByLabel("URL").fill("https://supabase.com/careers/platform-engineer");
    await page.getByLabel("Description").fill(jobDescription);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText("Platform Engineer").waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Generate match" }).first().click();
    await page.getByText("Match generated.").waitFor({ timeout: 90000 });
    await take(page, outputDir, "04-job-match.png");

    console.log("STEP: company research");
    await page.getByRole("button", { name: "Research company" }).first().click();
    await page.waitForURL(/company-research/, { timeout: 30000 });
    await page.getByLabel("Company name *").waitFor({ timeout: 30000 });
    const companyName = await page.getByLabel("Company name *").inputValue();
    const website = await page.getByLabel("Website").inputValue();
    if (companyName.trim() !== "Supabase") {
      throw new Error(`Expected company research handoff to prefill Supabase, received "${companyName}".`);
    }
    if (website.trim() !== "https://supabase.com") {
      throw new Error(`Expected company research handoff to prefill https://supabase.com, received "${website}".`);
    }
    await page.getByRole("button", { name: /^Generate$/ }).last().click();
    await page.getByText("Suggested Outreach Angles").waitFor({ timeout: 120000 });
    await page.getByText("Linked Pain Points").waitFor({ timeout: 120000 });
    await take(page, outputDir, "05-research-intelligence.png");

    console.log("STEP: pain points");
    await page.goto("http://127.0.0.1:4173/painpoints", { waitUntil: "networkidle" });
    await page.getByText("Suggested solution:", { exact: true }).first().waitFor({ timeout: 30000 });
    await take(page, outputDir, "06-painpoints.png");

    console.log("STEP: outreach campaign");
    await page.goto("http://127.0.0.1:4173/outreach?company=Supabase", { waitUntil: "networkidle" });
    await page.getByRole("dialog").waitFor({ timeout: 30000 });
    const resumeSelect = page.locator('select[aria-label="Resume *"]');
    if ((await resumeSelect.inputValue()) === "") {
      await resumeSelect.selectOption({ index: 1 });
    }
    await page.getByRole("button", { name: "Generate full campaign" }).click();
    await page.getByText("Cold email draft", { exact: true }).waitFor({ timeout: 120000 });
    await take(page, outputDir, "07-campaign-email.png");
    await page.getByRole("tab", { name: "Loom assets" }).click();
    await page.getByText("Loom script").waitFor({ timeout: 30000 });
    await take(page, outputDir, "08-campaign-loom.png");

    console.log(
      JSON.stringify(
        {
          ok: true,
          screenshots: [
            "01-resume-upload.png",
            "02-ats-details.png",
            "03-tailored-preview.png",
            "04-job-match.png",
            "05-research-intelligence.png",
            "06-painpoints.png",
            "07-campaign-email.png",
            "08-campaign-loom.png",
          ].map((file) => path.join(outputDir, file)),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    try {
      await take(page, outputDir, "99-error-state.png");
    } catch {
      // ignore screenshot failures during cleanup
    }
    throw error;
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
