import { supabaseAdmin } from "./supabase.js";
import { createNotification } from "./notification-center.js";
import { logger } from "./logger.js";
import {
  getCookie,
  setCookie,
  deleteCookie,
  validateCookie as validateStoredCookie,
  listCookies,
  updateCookieStatus,
  triggerCookieExpiryNotification,
  getLoginGuide as getProviderGuide,
  SUPPORTED_PROVIDERS,
} from "./provider-cookies.js";

export { SUPPORTED_PROVIDERS, getProviderGuide as getLoginGuide };

type ProviderCookieRow = {
  id: string;
  user_id: string;
  provider: string;
  cookie_value: string;
  status: string;
  health_data: any;
  created_at: string;
  updated_at: string;
};

export function checkProviderCookieSync(provider: string): {
  available: boolean;
  valid: boolean;
  reason?: string;
} {
  return {
    available: false,
    valid: false,
    reason: "No cookie configured (sync check requires DB)",
  };
}

export function validateCookieBasic(cookie: string): { valid: boolean; reason?: string } {
  if (!cookie || cookie.length < 10) return { valid: false, reason: "Cookie too short" };
  if (/\b(expired|signin|login)\b/i.test(cookie))
    return { valid: false, reason: "Contains expired/signin indicators" };
  if (/^[{[]/.test(cookie.trim()))
    return { valid: false, reason: "Looks like JSON, not cookie string" };
  return { valid: true };
}

export function getCookieValue(provider: string): string | null {
  return null;
}

export async function getPersistedCookieValue(
  userId: string,
  provider: string,
): Promise<string | null> {
  const stored = await getCookie(userId, provider);
  if (stored) return stored.cookie;
  return null;
}

export async function checkProviderCookie(
  userId: string,
  provider: string,
): Promise<{ status: string; message: string }> {
  const stored = await getCookie(userId, provider);

  if (!stored) {
    await createNotification({
      userId,
      category: "cookie_expiry",
      title: `${provider}: No cookie configured`,
      message: "Configure via Settings > Cookies",
      severity: "warning",
      metadata: { provider },
    });
    return {
      status: "missing",
      message: `No cookie configured for ${provider}. Go to Settings > Cookies to add one.`,
    };
  }

  if (stored.row.status === "expired" || stored.row.status === "invalid") {
    await createNotification({
      userId,
      category: "cookie_expiry",
      title: `${provider}: Cookie ${stored.row.status}`,
      message: stored.row.health_data?.error_message || "Cookie requires refresh",
      severity: "error",
      metadata: { provider, status: stored.row.status },
    });
    return {
      status: stored.row.status,
      message: `Cookie for ${provider} is ${stored.row.status}. Refresh in Settings > Cookies.`,
    };
  }

  if (stored.row.status === "valid") {
    await supabaseAdmin
      .from("provider_controls")
      .update({ status: "enabled", last_health_check_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", provider);
    return { status: "valid", message: `${provider} cookie is valid` };
  }

  const validation = await validateStoredCookie(userId, provider);
  if (validation.status === "valid") {
    await supabaseAdmin
      .from("provider_controls")
      .update({ status: "enabled", last_health_check_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", provider);
    return { status: "valid", message: `${provider} cookie validated` };
  }

  const currentControl: any = await supabaseAdmin
    .from("provider_controls")
    .select("status")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle()
    .then((r: any) => r.data);
  if (currentControl?.status !== "disabled") {
    await supabaseAdmin
      .from("provider_controls")
      .update({ status: "paused" })
      .eq("user_id", userId)
      .eq("provider", provider);
  }
  await triggerCookieExpiryNotification(userId, provider, validation);
  return {
    status: validation.status,
    message: `${provider} cookie ${validation.status}: ${validation.message}`,
  };
}

export async function refreshProviderCookie(
  userId: string,
  provider: string,
  newCookie: string,
): Promise<{ ok: boolean; message: string }> {
  const basic = validateCookieBasic(newCookie);
  if (!basic.valid) return { ok: false, message: `Invalid cookie: ${basic.reason}` };

  const set = await setCookie(userId, provider, newCookie);
  if (!set.ok) return set;

  const validation = await validateStoredCookie(userId, provider);
  await triggerCookieExpiryNotification(userId, provider, validation);

  await supabaseAdmin
    .from("provider_controls")
    .update({
      status: validation.status === "valid" ? "enabled" : "paused",
      last_health_check_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);

  return {
    ok: true,
    message:
      validation.status === "valid"
        ? `${provider} cookie is valid and active`
        : `${provider} cookie stored but validation returned: ${validation.status}. ${validation.message}`,
  };
}

export async function checkAllCookies(
  userId: string,
): Promise<Record<string, { status: string; message: string }>> {
  const results: Record<string, { status: string; message: string }> = {};
  for (const provider of SUPPORTED_PROVIDERS) {
    results[provider] = await checkProviderCookie(userId, provider);
  }
  const invalid = Object.entries(results).filter(([, r]) => r.status !== "valid");
  if (invalid.length > 0) {
    await createNotification({
      userId,
      category: "cookie_expiry",
      title: `${invalid.length}/${SUPPORTED_PROVIDERS.length} cookies need attention`,
      message: invalid.map(([p]) => p).join(", "),
      severity: invalid.length === SUPPORTED_PROVIDERS.length ? "error" : "warning",
      metadata: { invalid: invalid.map(([p]) => p) },
    });
  }
  return results;
}

const PROVIDER_URLS: Record<string, string> = {
  linkedin: "https://www.linkedin.com/feed/",
  indeed: "https://www.indeed.com/",
  naukri: "https://www.naukri.com/",
  wellfound: "https://wellfound.com/",
  instahyre: "https://www.instahyre.com/",
};

const PROVIDER_COOKIE_NAMES: Record<string, string[]> = {
  linkedin: ["li_at", "JSESSIONID"],
  indeed: ["CTK"],
  naukri: ["nauk_sid", "ntoken"],
  wellfound: ["_wellfound_session"],
  instahyre: ["sessionid", "csrftoken"],
};

export async function refreshCookieViaPlaywright(
  userId: string,
  provider: string,
): Promise<{ ok: boolean; message: string }> {
  if (process.env.VERCEL === "1") {
    const guide = await getProviderGuide(provider);
    await createNotification({
      userId,
      category: "cookie_expiry",
      title: `${provider}: Manual refresh required`,
      message: guide,
      severity: "info",
      metadata: { provider },
    });
    return {
      ok: true,
      message:
        `ℹ️ Serverless environment — can't launch browser.\n` +
        `Run locally: npx tsx scripts/refresh-cookies.ts --provider ${provider} --user-id ${userId}\n` +
        `Or paste cookie via /cookie ${provider} <value>`,
    };
  }

  try {
    const url = PROVIDER_URLS[provider];
    if (!url) return { ok: false, message: `Unknown provider: ${provider}` };

    const { getBrowserForProvider } = await import("./playwright-platform.js");
    const { setCookie } = await import("./provider-cookies.js");
    const { browser } = await getBrowserForProvider(provider as any, { headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    const currentUrl = page.url().toLowerCase();
    const authenticated =
      !currentUrl.includes("login") &&
      !currentUrl.includes("auth") &&
      !currentUrl.includes("signin");

    if (!authenticated) {
      await page.close();
      await context.close();
      await browser.close();
      return {
        ok: false,
        message:
          `❌ Not logged into ${provider} on the server's browser.\n` +
          `Login once via the dashboard browser session, then retry.\n` +
          `Or run locally: npx tsx scripts/refresh-cookies.ts --provider ${provider} --user-id ${userId}`,
      };
    }

    const cookies = await context.cookies();
    const relevantNames = PROVIDER_COOKIE_NAMES[provider] ?? [];
    const relevant = cookies.filter((c: any) => relevantNames.includes(c.name));

    if (relevant.length === 0) {
      await page.close();
      await context.close();
      await browser.close();
      const names = relevantNames.join(", ");
      return {
        ok: false,
        message:
          `❌ Found ${cookies.length} cookies on ${provider} but none matched expected names (${names}).\n` +
          `Try manual paste via /cookie ${provider} <value>`,
      };
    }

    const cookieStr = relevant.map((c: any) => `${c.name}=${c.value}`).join("; ");
    const saved = await setCookie(userId, provider, cookieStr);
    await page.close();
    await context.close();
    await browser.close();

    if (!saved.ok) return { ok: false, message: `❌ Failed to save cookies: ${saved.message}` };

    const msg = `✅ Extracted ${relevant.length} cookie(s) from ${provider} and saved to database.`;
    logger.info(`[cookie-manager] Server-side cookie refresh succeeded`, {
      userId,
      provider,
      count: relevant.length,
    });

    await createNotification({
      userId,
      category: "cookie_expiry",
      title: `${provider}: Cookies refreshed via server browser`,
      message: msg,
      severity: "info",
      metadata: { provider, count: relevant.length },
    });

    return { ok: true, message: msg };
  } catch (err: any) {
    logger.error(`[cookie-manager] refreshCookieViaPlaywright failed`, {
      userId,
      provider,
      error: err.message,
    });
    return {
      ok: false,
      message: `❌ Failed to refresh ${provider} cookie: ${err.message}`,
    };
  }
}

export async function deleteProviderCookie(
  userId: string,
  provider: string,
): Promise<{ ok: boolean; message: string }> {
  const result = await deleteCookie(userId, provider);
  if (!result.ok) return result;

  await supabaseAdmin
    .from("browser_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider.toLowerCase());

  await supabaseAdmin
    .from("provider_controls")
    .update({ consecutive_failures: 0, status: "enabled" })
    .eq("user_id", userId)
    .eq("provider", provider.toLowerCase());

  return { ok: true, message: `${provider} cookie removed and provider reset` };
}

export function validateCookieValue(cookie: string): { valid: boolean; reason?: string } {
  return validateCookieBasic(cookie);
}

export async function getAllCookieStatuses(
  userId: string,
): Promise<Array<{ provider: string; status: string; health_data: any }>> {
  const rows = await listCookies(userId);
  return rows.map((r: ProviderCookieRow) => ({
    provider: r.provider,
    status: r.status,
    health_data: r.health_data,
  }));
}
