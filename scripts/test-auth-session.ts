import fs from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
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

async function waitForServer(url: string, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServerTree(server: ChildProcess) {
  if (!server.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }
  server.kill("SIGTERM");
}

async function main() {
  const port = "4174";
  const email = `auth-session-${Date.now()}@example.com`;
  const password = "CareerCompass#123";
  const artifactsDir = path.resolve(process.cwd(), "artifacts", "auth-session");
  await fs.mkdir(artifactsDir, { recursive: true });

  const createdUser = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Auth Session Tester" },
  });
  if (createdUser.error || !createdUser.data.user) {
    throw new Error(createdUser.error?.message ?? "Failed to create temp user.");
  }

  const server = spawn("cmd.exe", ["/c", "npx.cmd", "tsx", "scripts/local-e2e-server.mjs"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: port },
  });
  server.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));
  server.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

  try {
    await waitForServer(`http://127.0.0.1:${port}/login`);

    await page.goto(`http://127.0.0.1:${port}/login`, { waitUntil: "networkidle" });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/dashboard/, { timeout: 30000 });

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForURL(/dashboard/, { timeout: 30000 });

    await page.goto(`http://127.0.0.1:${port}/resumes`, { waitUntil: "networkidle" });
    await page.waitForURL(/resumes/, { timeout: 30000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForURL(/resumes/, { timeout: 30000 });

    await page.screenshot({
      path: path.join(artifactsDir, "auth-session.png"),
      fullPage: true,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: [
            "password_login_redirected_to_dashboard",
            "dashboard_refresh_preserved_session",
            "protected_route_refresh_preserved_session",
          ],
          screenshot: path.join(artifactsDir, "auth-session.png"),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await stopServerTree(server);
    await admin.auth.admin.deleteUser(createdUser.data.user.id);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
