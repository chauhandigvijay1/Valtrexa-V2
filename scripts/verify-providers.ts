import { chromium } from "playwright";
import { config } from "dotenv";
config({ path: ".env" });

const PROVIDERS: Record<string, { url: string; domain: string }> = {
  linkedin: { url: "https://www.linkedin.com/jobs/", domain: ".linkedin.com" },
  indeed: { url: "https://in.indeed.com/", domain: ".indeed.com" },
  naukri: { url: "https://www.naukri.com/", domain: ".naukri.com" },
  wellfound: { url: "https://wellfound.com/jobs", domain: ".wellfound.com" },
  instahyre: { url: "https://www.instahyre.com/", domain: ".instahyre.com" },
};

async function main() {
  console.log("=== REAL PROVIDER AUTHENTICATION VERIFICATION ===\n");

  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  });

  const results: Record<string, string> = {};

  for (const [name, cfg] of Object.entries(PROVIDERS)) {
    const cookieStr = process.env[name.toUpperCase() + "_COOKIE"] || "";
    console.log(`--- ${name.toUpperCase()} ---`);

    // Parse cookies and add them one by one, handling invalid ones gracefully
    const pairs = cookieStr.split("; ").filter(Boolean);
    let added = 0;
    for (const pair of pairs) {
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const cName = pair.substring(0, eq);
      const cValue = pair.substring(eq + 1);
      if (!cName || !cValue) continue;
      try {
        await context.addCookies([{ name: cName, value: cValue, domain: cfg.domain, path: "/" }]);
        added++;
      } catch {
        // some cookies may have special characters - skip silently
      }
    }

    const page = await context.newPage();
    let statusText = "";
    let authenticated = false;
    let finalUrl = "";

    try {
      await page.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);
      finalUrl = page.url();

      const redirected =
        finalUrl.toLowerCase().includes("login") ||
        finalUrl.toLowerCase().includes("signin") ||
        finalUrl.toLowerCase().includes("auth") ||
        finalUrl.toLowerCase().includes("signup") ||
        finalUrl.toLowerCase().includes("log-in") ||
        finalUrl.toLowerCase().includes("sign-in");

      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || "");
      const hasLoginForm =
        bodyText.toLowerCase().includes("sign in") ||
        bodyText.toLowerCase().includes("log in") ||
        bodyText.toLowerCase().includes("email or phone") ||
        bodyText.toLowerCase().includes("password");

      // A provider is authenticated if:
      // 1. Not redirected to a login page
      // 2. The page content doesn't show a login form
      // 3. We can see actual page content (not a login wall)
      if (!redirected && !hasLoginForm && bodyText.length > 50) {
        authenticated = true;
      }

      console.log(`  URL: ${finalUrl.substring(0, 80)}`);
      console.log(`  Body: ${bodyText.substring(0, 80).replace(/\n/g, " ")}`);
      console.log(`  Authenticated: ${authenticated ? "✅ YES" : "❌ NO"}`);
      if (!authenticated) {
        console.log(`  Reason: ${redirected ? "Redirected to login" : "Login form detected"}`);
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message.substring(0, 100)}`);
      statusText = `ERROR: ${e.message.substring(0, 60)}`;
    }

    results[name] = authenticated
      ? "AUTHENTICATED"
      : `FAILED (${finalUrl ? "redirect/login" : "error"})`;
    await page.close();
  }

  await browser.close();

  console.log("\n=== FINAL AUTHENTICATION RESULTS ===");
  const allPass: string[] = [];
  const allFail: string[] = [];
  for (const [name, status] of Object.entries(results)) {
    if (status === "AUTHENTICATED") allPass.push(name);
    else allFail.push(`${name}: ${status}`);
    console.log(`  ${name}: ${status === "AUTHENTICATED" ? "✅" : "❌"} ${status}`);
  }
  console.log(`\nAuthenticated: ${allPass.length}/5 (${allPass.join(", ") || "none"})`);
  if (allFail.length > 0)
    console.log(`Failed: ${allFail.length}/5 (${allFail.join(", ") || "none"})`);
}

main();
