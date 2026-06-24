import { chromium } from "playwright";
import { spawnSync } from "child_process";
import { config } from "dotenv";
config({ path: ".env" });

const LOCAL_APP_DATA = process.env.LOCALAPPDATA || `${process.env.USERPROFILE}\\AppData\\Local`;
const EDGE_USER_DATA = `${LOCAL_APP_DATA}\\Microsoft\\Edge\\User Data`;
const PROFILE_DIR = "Profile 3";

const AUTH_PROVIDERS: Record<string, { domain: string; keyCookies: string[] }> = {
  linkedin: { domain: ".linkedin.com", keyCookies: ["li_at"] },
  indeed: { domain: ".indeed.com", keyCookies: ["__Secure-PassportAuthProxy-BearerToken", "CTK"] },
  naukri: { domain: ".naukri.com", keyCookies: ["nauk_sid", "nauk_cs"] },
  wellfound: { domain: ".wellfound.com", keyCookies: ["_wellfound", "remember_token"] },
  instahyre: { domain: ".instahyre.com", keyCookies: ["sessionid"] },
};

async function main() {
  console.log("=== COOKIE REFRESH v7 — DIRECT EDGE PROFILE ===");
  console.log(`Profile: ${EDGE_USER_DATA}\\${PROFILE_DIR}`);

  // Launch Edge directly against the real profile (Edge is dead, no lock)
  const context = await chromium.launchPersistentContext(EDGE_USER_DATA, {
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: [
      `--profile-directory=${PROFILE_DIR}`,
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--disable-sync",
    ],
  });

  // Read ALL cookies immediately without navigation
  const allCookies = await context.cookies();
  console.log(`Total cookies loaded: ${allCookies.length}`);

  const updates: Record<string, string> = {};

  for (const [provider, cfg] of Object.entries(AUTH_PROVIDERS)) {
    console.log(`\n--- ${provider.toUpperCase()} ---`);
    const baseDomain = cfg.domain.replace(/^\./, "");

    const providerCookies = allCookies.filter((c) => (c.domain || "").includes(baseDomain));
    console.log(`Found ${providerCookies.length} cookies for ${baseDomain}`);

    const keyMatches = providerCookies.filter((c) =>
      cfg.keyCookies.some((kc) => c.name.includes(kc)),
    );
    for (const c of keyMatches) {
      console.log(`  ✅ ${c.name}: ${c.value.substring(0, 30)}... (${c.value.length} chars)`);
    }

    if (providerCookies.length > 0) {
      updates[provider] = providerCookies.map((c) => `${c.name}=${c.value}`).join("; ");
      if (keyMatches.length >= cfg.keyCookies.length) {
        console.log(`✅ ALL ${cfg.keyCookies.length} key cookies captured`);
      } else {
        console.log(`⚠️ partial (${keyMatches.length}/${cfg.keyCookies.length})`);
      }
    } else {
      console.log(`❌ no cookies found`);
    }
  }

  await context.close();

  // Update .env
  if (Object.keys(updates).length > 0) {
    const { readFileSync, writeFileSync } = await import("fs");
    let env = readFileSync(".env", "utf-8");
    for (const [provider, cookieStr] of Object.entries(updates)) {
      const envVar = `${provider.toUpperCase()}_COOKIE`;
      const escaped = cookieStr.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      if (env.includes(`${envVar}=`)) {
        env = env.replace(new RegExp(`^${envVar}=.*$`, "m"), `${envVar}="${escaped}"`);
      } else {
        env += `\n${envVar}="${escaped}"`;
      }
    }
    writeFileSync(".env", env);
    console.log("\n✅ .env updated");
    for (const provider of Object.keys(updates)) {
      console.log(`  ${provider.toUpperCase()}_COOKIE`);
    }
  }

  // Relaunch Edge
  console.log("\nRelaunching Edge...");
  try {
    spawnSync("start", ["msedge", "about:blank"], { shell: true, stdio: "pipe", timeout: 5000 });
  } catch {
    /* noop */
  }
}

main();
