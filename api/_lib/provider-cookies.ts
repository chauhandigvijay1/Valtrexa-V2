import { supabaseAdmin } from "./supabase.js";
import { createNotification } from "./notification-center.js";
import { encrypt, decrypt } from "./crypto-utils.js";

export type CookieStatus =
  | "valid"
  | "invalid"
  | "expired"
  | "pending"
  | "captcha_required"
  | "network_error"
  | "login_required";

export type CookieHealthData = {
  last_success?: string | null;
  last_failure?: string | null;
  last_validation?: string | null;
  expiry?: string | null;
  provider_version?: string | null;
  error_message?: string | null;
};

export type ProviderCookieRow = {
  id: string;
  user_id: string;
  provider: string;
  cookie_value: string;
  status: CookieStatus;
  health_data: CookieHealthData;
  created_at: string;
  updated_at: string;
};

export type ValidateResult = {
  status: CookieStatus;
  message?: string;
};

const PROVIDER_DOMAINS: Record<string, string> = {
  linkedin: "www.linkedin.com",
  indeed: "www.indeed.com",
  naukri: "www.naukri.com",
  wellfound: "wellfound.com",
  instahyre: "www.instahyre.com",
};

const PROVIDER_VALIDATION_URLS: Record<string, string> = {
  linkedin: "https://www.linkedin.com/feed/",
  indeed: "https://www.indeed.com/",
  naukri: "https://www.naukri.com/",
  wellfound: "https://wellfound.com/",
  instahyre: "https://www.instahyre.com/",
};

function getProviderDomain(provider: string): string {
  return PROVIDER_DOMAINS[provider.toLowerCase()] || provider;
}

export async function getCookie(
  userId: string,
  provider: string,
): Promise<{ cookie: string; row: ProviderCookieRow } | null> {
  const { data, error } = await supabaseAdmin
    .from("provider_cookies")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider.toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  try {
    const cookie_value = decrypt(data.cookie_value);
    return { cookie: cookie_value, row: data as ProviderCookieRow };
  } catch {
    return null;
  }
}

export async function setCookie(
  userId: string,
  provider: string,
  cookieValue: string,
): Promise<{ ok: boolean; message: string }> {
  const providerLower = provider.toLowerCase();
  const encrypted = encrypt(cookieValue);
  const { error } = await supabaseAdmin.from("provider_cookies").upsert(
    {
      user_id: userId,
      provider: providerLower,
      cookie_value: encrypted,
      status: "pending",
      health_data: {},
    },
    { onConflict: "user_id,provider" },
  );
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${provider} cookie stored successfully` };
}

export async function deleteCookie(
  userId: string,
  provider: string,
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabaseAdmin
    .from("provider_cookies")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider.toLowerCase());
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${provider} cookie removed` };
}

export async function updateCookieStatus(
  userId: string,
  provider: string,
  status: CookieStatus,
  healthData?: Partial<CookieHealthData>,
): Promise<void> {
  const update: any = { status };
  if (healthData) {
    const existing = await getCookie(userId, provider);
    update.health_data = { ...(existing?.row.health_data || {}), ...healthData };
  }
  await supabaseAdmin
    .from("provider_cookies")
    .update(update)
    .eq("user_id", userId)
    .eq("provider", provider.toLowerCase());
}

export async function listCookies(userId: string): Promise<ProviderCookieRow[]> {
  const { data, error } = await supabaseAdmin
    .from("provider_cookies")
    .select("*")
    .eq("user_id", userId)
    .order("provider");
  if (error || !data) return [];
  return data as ProviderCookieRow[];
}

const VALIDATION_TIMEOUT = 10_000;

async function httpValidateCookie(provider: string, cookieValue: string): Promise<ValidateResult> {
  const url = PROVIDER_VALIDATION_URLS[provider.toLowerCase()];
  if (!url) return { status: "invalid", message: "No validation URL configured" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT);

    const response = await fetch(url, {
      headers: {
        Cookie: cookieValue,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "manual",
      signal: controller.signal,
    });

    clearTimeout(timer);
    const body = await response.text().catch(() => "");

    const domain = getProviderDomain(provider);
    const isAuthPage =
      body.includes("login") ||
      body.includes("signin") ||
      body.includes("Sign in") ||
      body.includes("Log in") ||
      body.includes("/auth/") ||
      body.includes("/login") ||
      body.includes("auth0") ||
      body.toLowerCase().includes("captcha") ||
      body.toLowerCase().includes("verify your identity");

    const isRedirectToLogin =
      response.status === 302 &&
      (response.headers.get("location")?.includes("login") ||
        response.headers.get("location")?.includes("auth") ||
        response.headers.get("location")?.includes("signin"));

    if (response.ok && !isAuthPage && !isRedirectToLogin) {
      return { status: "valid", message: `Authenticated session for ${provider}` };
    }

    if (isRedirectToLogin || response.status === 401 || response.status === 403) {
      return { status: "expired", message: `Session expired for ${provider}` };
    }

    if (body.toLowerCase().includes("captcha") || body.toLowerCase().includes("verify")) {
      return { status: "captcha_required", message: `CAPTCHA challenge for ${provider}` };
    }

    return {
      status: "invalid",
      message: `Unexpected response (${response.status}) for ${provider}`,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { status: "network_error", message: `Validation timed out for ${provider}` };
    }
    return { status: "network_error", message: `Network error for ${provider}: ${err.message}` };
  }
}

export async function validateCookie(userId: string, provider: string): Promise<ValidateResult> {
  const entry = await getCookie(userId, provider);
  if (!entry) return { status: "pending", message: "No cookie stored" };

  const result = await httpValidateCookie(provider, entry.cookie);

  const now = new Date().toISOString();
  const healthUpdate: Partial<CookieHealthData> = {
    last_validation: now,
    provider_version: provider,
  };

  if (result.status === "valid") {
    healthUpdate.last_success = now;
    healthUpdate.expiry = null;
    healthUpdate.error_message = null;
  } else {
    healthUpdate.last_failure = now;
    healthUpdate.error_message = result.message || null;
  }

  await updateCookieStatus(userId, provider, result.status, healthUpdate);
  return result;
}

export async function validateAllCookies(userId: string): Promise<Record<string, ValidateResult>> {
  const cookies = await listCookies(userId);
  const results: Record<string, ValidateResult> = {};
  for (const c of cookies) {
    results[c.provider] = await validateCookie(userId, c.provider);
  }
  return results;
}

export async function triggerCookieExpiryNotification(
  userId: string,
  provider: string,
  result: ValidateResult,
): Promise<void> {
  await createNotification({
    userId,
    category: "cookie_expiry",
    title: `${provider}: Cookie ${result.status}`,
    message: result.message || `${provider} cookie requires attention`,
    severity:
      result.status === "valid" ? "success" : result.status === "expired" ? "error" : "warning",
    metadata: { provider, status: result.status },
  });
}

export async function getLoginGuide(provider: string): Promise<string> {
  const guides: Record<string, string> = {
    linkedin: `1. Open https://www.linkedin.com in Chrome
2. Log in to your LinkedIn account
3. Press F12 → Application → Storage → Cookies
4. Copy all cookies as text (name=value; separated)
5. Paste into the cookie input field below`,
    indeed: `1. Open https://www.indeed.com in Chrome
2. Log in
3. Press F12 → Application → Storage → Cookies
4. Copy all cookies as text
5. Paste into the cookie input field below`,
    naukri: `1. Open https://www.naukri.com in Chrome
2. Log in
3. Press F12 → Application → Storage → Cookies
4. Copy the nauk_sid cookie value
5. Paste into the cookie input field below`,
    wellfound: `1. Open https://wellfound.com in Chrome
2. Log in
3. Press F12 → Application → Storage → Cookies
4. Copy the _wellfound cookie value
5. Paste into the cookie input field below`,
    instahyre: `1. Open https://www.instahyre.com in Chrome
2. Log in
3. Press F12 → Application → Storage → Cookies
4. Copy sessionid and csrftoken cookies
5. Paste into the cookie input field below`,
  };
  return (
    guides[provider.toLowerCase()] || `No guide for ${provider}. Check provider documentation.`
  );
}

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_DOMAINS);
