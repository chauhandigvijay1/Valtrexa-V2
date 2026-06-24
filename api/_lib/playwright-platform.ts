/**
 * B1 — Playwright Platform.
 *
 * Persistent sessions, storage states, cookie manager, and browser profile
 * manager. Credentials are NEVER hardcoded — read from env per provider.
 *
 * Storage states are persisted in the `browser_sessions` table so the same
 * authenticated browser context can be reused across runs and workers.
 *
 * Env contract (already declared in .env.example):
 *   LINKEDIN_COOKIE, NAUKRI_COOKIE, WELLFOUND_COOKIE, INDEED_COOKIE,
 *   INSTAHYRE_COOKIE  — raw `Cookie:` header strings or `name=value` pairs.
 *
 * If Playwright is unavailable at runtime (e.g. serverless without browsers),
 * every function degrades gracefully and returns a structured status.
 */

import { supabaseAdmin } from "./supabase.js";

export type BrowserProviderName = "linkedin" | "indeed" | "naukri" | "instahyre" | "wellfound";

type StoredSession = {
  id: string;
  provider: string;
  storage_state: any;
  cookies: any[];
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
};

const ENV_COOKIE_BY_PROVIDER: Record<BrowserProviderName, string> = {
  linkedin: "LINKEDIN_COOKIE",
  indeed: "INDEED_COOKIE",
  naukri: "NAUKRI_COOKIE",
  instahyre: "INSTAHYRE_COOKIE",
  wellfound: "WELLFOUND_COOKIE",
};

const COOKIE_DOMAIN_HINT: Record<BrowserProviderName, string> = {
  linkedin: ".linkedin.com",
  indeed: ".indeed.com",
  naukri: ".naukri.com",
  instahyre: ".instahyre.com",
  wellfound: ".wellfound.com",
};

/** Parse a raw cookie header / "name=value" list into Playwright cookie objects. */
export function parseCookieHeader(
  rawHeader: string,
  domainHint: string,
): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
}> {
  if (!rawHeader?.trim()) return [];
  // Accept both "cookie: a=1; b=2" and "a=1; b=2" forms.
  const cleaned = rawHeader.replace(/^cookie:\s*/i, "").trim();
  return cleaned
    .split(/;\s*/)
    .filter(Boolean)
    .map((pair) => {
      const [rawName, ...rest] = pair.split("=");
      const name = (rawName ?? "")
        .trim()
        .replace(/^__Secure-/, "")
        .replace(/^__Host-/, "");
      const value = rest.join("=").trim();
      return {
        name,
        value,
        domain: domainHint,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        httpOnly: true,
        secure: true,
        sameSite: "Lax" as const,
      };
    })
    .filter((c) => c.name && c.value);
}

/** Load a storage state from env (cookie header) — no credentials in code. */
export function buildStorageStateFromEnv(provider: BrowserProviderName): {
  storageState: any;
  cookies: any[];
  empty: boolean;
} {
  const envVar = ENV_COOKIE_BY_PROVIDER[provider];
  const raw = process.env[envVar] ?? "";
  const domain = COOKIE_DOMAIN_HINT[provider];
  const cookies = parseCookieHeader(raw, domain);
  const storageState = {
    cookies,
    origins: [],
  };
  return { storageState, cookies, empty: cookies.length === 0 };
}

/** Fetch the persisted session row for a user/provider (if any). */
export async function loadStoredSession(
  userId: string,
  provider: BrowserProviderName,
): Promise<StoredSession | null> {
  const { data, error } = await supabaseAdmin
    .from("browser_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as StoredSession;
}

/** Merge env cookie + stored storage state, preferring env (most recent manual update). */
export async function resolveStorageState(
  userId: string,
  provider: BrowserProviderName,
): Promise<{ storageState: any; source: "env" | "stored" | "empty"; cookies: any[] }> {
  const fromEnv = buildStorageStateFromEnv(provider);
  if (!fromEnv.empty) {
    await upsertStoredSession(userId, provider, fromEnv.storageState, fromEnv.cookies, "ready");
    return { storageState: fromEnv.storageState, source: "env", cookies: fromEnv.cookies };
  }
  const stored = await loadStoredSession(userId, provider);
  if (stored?.cookies?.length) {
    await touchStoredSession(stored.id);
    return { storageState: stored.storage_state, source: "stored", cookies: stored.cookies };
  }
  return { storageState: { cookies: [], origins: [] }, source: "empty", cookies: [] };
}

async function upsertStoredSession(
  userId: string,
  provider: BrowserProviderName,
  storageState: any,
  cookies: any[],
  status: string,
) {
  const payload = {
    user_id: userId,
    provider,
    storage_state: storageState,
    cookies,
    status,
    last_used_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  } as any;
  await supabaseAdmin.from("browser_sessions").upsert(payload, { onConflict: "user_id,provider" });
}

async function touchStoredSession(id: string) {
  await supabaseAdmin
    .from("browser_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);
}

/** Save a fresh storage state captured from a live Playwright context (post-login). */
export async function saveCapturedStorageState(
  userId: string,
  provider: BrowserProviderName,
  storageState: any,
) {
  const cookies = Array.isArray(storageState?.cookies) ? storageState.cookies : [];
  await upsertStoredSession(userId, provider, storageState, cookies, "ready");
  return { saved: true, cookieCount: cookies.length };
}

/**
 * Launch an authenticated Playwright browser context for a provider.
 * Falls back to an inert status if Playwright or browsers are not installed.
 */
export async function launchAuthenticatedContext(
  userId: string,
  provider: BrowserProviderName,
  options?: { headless?: boolean },
): Promise<{
  status: "ready" | "ready_for_credentials" | "unavailable";
  storageState: any;
  cookies: any[];
  message: string;
}> {
  const { storageState, source, cookies } = await resolveStorageState(userId, provider);
  if (source === "empty") {
    return {
      status: "ready_for_credentials",
      storageState,
      cookies,
      message: `No session found for ${provider}. Set the ${ENV_COOKIE_BY_PROVIDER[provider]} env var or run a login capture.`,
    };
  }

  // Playwright is imported lazily so this module loads cleanly in serverless.
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: options?.headless ?? true });
    const context = await browser.newContext({ storageState });
    // The caller is responsible for closing; we just verify it boots.
    await context.close();
    await browser.close();
    return {
      status: "ready",
      storageState,
      cookies,
      message: `Playwright context ready for ${provider} (${cookies.length} cookies, source=${source}).`,
    };
  } catch (err: any) {
    return {
      status: "unavailable",
      storageState,
      cookies,
      message: `Playwright runtime unavailable: ${err?.message ?? err}. Storage state resolved; browser automation skipped.`,
    };
  }
}

/** List all browser session profiles for a user. */
export async function listBrowserProfiles(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("browser_sessions")
    .select("id,provider,status,last_used_at,expires_at,notes")
    .eq("user_id", userId)
    .order("provider", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    ...row,
    has_env_credentials: !!process.env[ENV_COOKIE_BY_PROVIDER[row.provider as BrowserProviderName]],
  }));
}

/** Delete a stored session profile (env cookies are untouched). */
export async function deleteBrowserProfile(userId: string, provider: BrowserProviderName) {
  const { error } = await supabaseAdmin
    .from("browser_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new Error(error.message);
  return { deleted: true };
}
