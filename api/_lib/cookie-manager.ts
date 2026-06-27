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

const PROVIDER_COOKIE_ENV: Record<string, string> = {
  linkedin: "LINKEDIN_COOKIE",
  indeed: "INDEED_COOKIE",
  naukri: "NAUKRI_COOKIE",
  wellfound: "WELLFOUND_COOKIE",
  instahyre: "INSTAHYRE_COOKIE",
};

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

function getEnvCookie(provider: string): string | null {
  const envKey = PROVIDER_COOKIE_ENV[provider.toLowerCase()];
  if (!envKey) return null;
  return process.env[envKey]?.trim() ?? null;
}

export function checkProviderCookieSync(provider: string): {
  available: boolean;
  valid: boolean;
  reason?: string;
} {
  const envFallback = getEnvCookie(provider);
  if (envFallback) {
    const basic = validateCookieBasic(envFallback);
    return { available: true, valid: basic.valid, reason: basic.reason };
  }
  return { available: false, valid: false, reason: "No cookie configured" };
}

export function validateCookieBasic(cookie: string): { valid: boolean; reason?: string } {
  if (!cookie || cookie.length < 10) return { valid: false, reason: "Cookie too short" };
  if (/expired|signin|login/i.test(cookie))
    return { valid: false, reason: "Contains expired/signin indicators" };
  if (/^[{[]/.test(cookie.trim()))
    return { valid: false, reason: "Looks like JSON, not cookie string" };
  return { valid: true };
}

export function getCookieValue(provider: string): string | null {
  const envFallback = getEnvCookie(provider);
  if (envFallback) {
    const basic = validateCookieBasic(envFallback);
    return basic.valid ? envFallback : null;
  }
  return null;
}

export async function getPersistedCookieValue(
  userId: string,
  provider: string,
): Promise<string | null> {
  const stored = await getCookie(userId, provider);
  if (stored) return stored.cookie;
  return getCookieValue(provider);
}

export async function checkProviderCookie(
  userId: string,
  provider: string,
): Promise<{ status: string; message: string }> {
  const stored = await getCookie(userId, provider);

  if (!stored) {
    const envFallback = getEnvCookie(provider);
    if (envFallback) {
      const basic = validateCookieBasic(envFallback);
      if (basic.valid) {
        await setCookie(userId, provider, envFallback);
        return { status: "valid", message: `${provider} cookie loaded from env` };
      }
    }
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

  await supabaseAdmin
    .from("provider_controls")
    .update({ status: "paused" })
    .eq("user_id", userId)
    .eq("provider", provider);
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

export async function refreshCookieViaPlaywright(
  userId: string,
  provider: string,
): Promise<{ ok: boolean; message: string }> {
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
    message: `ℹ️ Automated refresh not available from server for ${provider}.\n\n` +
      `For one-click extraction from your local browser, run:\n` +
      `npx tsx scripts/refresh-cookies.ts --provider ${provider} --user-id ${userId}\n\n` +
      `Alternatively, follow these steps:\n${guide}\n\n` +
      `Then paste the cookie in Settings > Cookies or use /cookie ${provider} <value> in Telegram.`,
  };
}

export async function deleteProviderCookie(
  userId: string,
  provider: string,
): Promise<{ ok: boolean; message: string }> {
  return deleteCookie(userId, provider);
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
