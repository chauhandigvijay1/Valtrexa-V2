import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { accessSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { encrypt as encryptCookie } from "../api/_lib/crypto-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local"), override: true });

const PROVIDER_URLS: Record<string, string> = {
  linkedin: "https://www.linkedin.com/feed/",
  indeed: "https://www.indeed.com/",
  naukri: "https://www.naukri.com/",
  wellfound: "https://wellfound.com/",
  instahyre: "https://www.instahyre.com/",
};

const PROVIDER_COOKIES: Record<string, string[]> = {
  linkedin: ["li_at"],
  indeed: ["CTK", "SESSION_ID"],
  naukri: ["nauk_sid"],
  wellfound: ["_wellfound_session"],
  instahyre: ["sessionid", "csrftoken"],
};

function findEdgeExecutable(): string {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    try {
      accessSync(path);
      return path;
    } catch {}
  }
  return "";
}

function getProfileDirectory(): string {
  return process.env.EDGE_PROFILE_DIRECTORY || "Default";
}

function getUserDataDir(): string {
  const dir = process.env.EDGE_USER_DATA_DIR;
  if (!dir) throw new Error("EDGE_USER_DATA_DIR must be set when using Edge profile login");
  return dir;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface Args {
  provider: string;
  userId: string;
  browser: "edge" | "chrome";
  headless: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
      parsed[key] = value;
      if (!args[i + 1]?.startsWith("--")) i++;
    }
  }

  const provider = parsed.provider || process.env.REFRESH_PROVIDER || "";
  const userId = parsed.userId || process.env.REFRESH_USER_ID || "";

  if (!provider) throw new Error("--provider is required");
  if (!userId) throw new Error("--user-id is required");
  if (!PROVIDER_URLS[provider]) throw new Error(`Unknown provider: ${provider}`);

  return {
    provider: provider.toLowerCase(),
    userId,
    browser: (parsed.browser as "edge" | "chrome") || "edge",
    headless: parsed.headless === "false" ? false : true,
  };
}

async function extractCookies(args: Args): Promise<string | null> {
  const url = PROVIDER_URLS[args.provider];
  console.log(`Launching ${args.browser} with profile "${getProfileDirectory()}"...`);
  console.log(`Navigating to ${url}...`);

  const executablePath =
    args.browser === "edge" ? findEdgeExecutable() : process.env.CHROME_PATH || "";

  const browser = await chromium.launch({
    executablePath: executablePath || undefined,
    headless: args.headless,
    args: [
      `--user-data-dir=${getUserDataDir()}`,
      `--profile-directory=${getProfileDirectory()}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    console.log("Waiting for page to load...");
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const cookies = await context.cookies();
    const relevantCookies = PROVIDER_COOKIES[args.provider] || [];
    const found = cookies.filter((c) =>
      relevantCookies.some((name) => c.name.toLowerCase() === name.toLowerCase()),
    );

    if (found.length === 0) {
      const names = relevantCookies.join(", ");
      console.error(`No matching cookies found for ${args.provider}. Expected: ${names}`);
      console.error("Ensure you are logged in and the profile has active sessions.");
      return null;
    }

    const cookieStr = found.map((c) => `${c.name}=${c.value}`).join("; ");
    console.log(`Extracted ${found.length}/${relevantCookies.length} relevant cookies`);
    for (const c of found) {
      console.log(`  ${c.name}=${c.value.substring(0, 20)}...`);
    }
    return cookieStr;
  } finally {
    await browser.close();
  }
}

async function saveCookie(userId: string, provider: string, cookieValue: string): Promise<void> {
  const supabase = getSupabaseClient();
  const encrypted = encryptCookie(cookieValue);

  const { error } = await supabase.from("provider_cookies").upsert(
    {
      user_id: userId,
      provider: provider.toLowerCase(),
      cookie_value: encrypted,
      status: "valid",
      health_data: {
        last_success: new Date().toISOString(),
        last_validation: new Date().toISOString(),
        provider_version: "1.0",
      },
    },
    { onConflict: "user_id,provider" },
  );

  if (error) throw new Error(`Failed to save cookie: ${error.message}`);
  console.log(`Cookie saved for ${provider} (user: ${userId.substring(0, 8)}...)`);

  await supabase
    .from("provider_controls")
    .update({
      consecutive_failures: 0,
      status: "enabled",
      last_success_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider.toLowerCase());
}

async function main() {
  try {
    const args = parseArgs();
    console.log(`\n🍪 Cookie Refresh for ${args.provider}`);
    console.log(`   User: ${args.userId.substring(0, 8)}...`);
    console.log(`   Browser: ${args.browser}\n`);

    const cookieStr = await extractCookies(args);
    if (!cookieStr) {
      console.error("\nFailed to extract cookies. Make sure you are logged in.");
      console.log("Tips:");
      console.log("  - Close all Edge windows before running");
      console.log("  - Set EDGE_PROFILE_DIRECTORY if not using 'Default'");
      console.log("  - Set EDGE_USER_DATA_DIR for custom Edge data path");
      console.log("  - Run with --headless=false to see the browser");
      process.exit(1);
    }

    await saveCookie(args.userId, args.provider, cookieStr);
    console.log(`\n✅ ${args.provider} cookie refreshed successfully!`);
    process.exit(0);
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

main();
