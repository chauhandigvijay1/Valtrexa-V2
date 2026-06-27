import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "./supabase.js";
import { getCookie } from "./provider-cookies.js";

export type BrowserProviderName = "linkedin" | "indeed" | "naukri" | "instahyre" | "wellfound";

export type BrowserEngine = "chromium" | "edge";

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

function buildStorageStateFromEnv(provider: BrowserProviderName): {
  storageState: any;
  cookies: any[];
  empty: boolean;
} {
  const envVar = ENV_COOKIE_BY_PROVIDER[provider];
  const raw = process.env[envVar] ?? "";
  const domain = COOKIE_DOMAIN_HINT[provider];
  const cookies = parseCookieHeader(raw, domain);
  return { storageState: { cookies, origins: [] }, cookies, empty: cookies.length === 0 };
}

export async function buildStorageStateFromDB(
  userId: string,
  provider: BrowserProviderName,
): Promise<{ storageState: any; cookies: any[]; empty: boolean }> {
  const entry = await getCookie(userId, provider);
  if (entry) {
    const domain = COOKIE_DOMAIN_HINT[provider];
    const cookies = parseCookieHeader(entry.cookie, domain);
    return { storageState: { cookies, origins: [] }, cookies, empty: cookies.length === 0 };
  }
  return { storageState: { cookies: [], origins: [] }, cookies: [], empty: true };
}

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

export async function resolveStorageState(
  userId: string,
  provider: BrowserProviderName,
): Promise<{ storageState: any; source: string; cookies: any[] }> {
  const fromDB = await buildStorageStateFromDB(userId, provider);
  if (!fromDB.empty) {
    await upsertStoredSession(userId, provider, fromDB.storageState, fromDB.cookies, "ready");
    return { storageState: fromDB.storageState, source: "db", cookies: fromDB.cookies };
  }
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

export async function saveCapturedStorageState(
  userId: string,
  provider: BrowserProviderName,
  storageState: any,
) {
  const cookies = Array.isArray(storageState?.cookies) ? storageState.cookies : [];
  await upsertStoredSession(userId, provider, storageState, cookies, "ready");
  return { saved: true, cookieCount: cookies.length };
}

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
  if (process.env.VERCEL === "1") {
    const { storageState, cookies } = await resolveStorageState(userId, provider);
    return {
      status: "unavailable",
      storageState,
      cookies,
      message:
        "Browser automation requires a dedicated worker. Deploy to Railway/VPS or run locally.",
    };
  }
  const { storageState, source, cookies } = await resolveStorageState(userId, provider);
  if (source === "empty") {
    return {
      status: "ready_for_credentials",
      storageState,
      cookies,
      message: `No session found for ${provider}. Add a cookie in Settings > Cookies.`,
    };
  }
  try {
    const { browser, engine } = await getBrowserForProvider(provider, {
      headless: options?.headless ?? true,
    });
    const context = await browser.newContext({ storageState });
    await context.close();
    await browser.close();
    const engineLabel = engine === "edge" ? "Edge" : "Chromium";
    return {
      status: "ready",
      storageState,
      cookies,
      message: `${engineLabel} context ready for ${provider} (${cookies.length} cookies, source=${source}).`,
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

export async function deleteBrowserProfile(userId: string, provider: BrowserProviderName) {
  const { error } = await supabaseAdmin
    .from("browser_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new Error(error.message);
  return { deleted: true };
}

export function detectEdgePath(): string | null {
  const override = process.env.EDGE_PATH;
  if (override && existsSync(override)) {
    return override;
  }
  const candidates = [
    join("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"),
    join("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"),
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Microsoft\\Edge\\Application\\msedge.exe")
      : null,
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  try {
    const result = execSync(
      'REG QUERY "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" /ve',
      { encoding: "utf-8", timeout: 3000 },
    );
    const match = result.match(/:\s+(.+\.exe)/i);
    if (match && existsSync(match[1].trim())) {
      return match[1].trim();
    }
  } catch {
    // registry lookup is best-effort
  }
  return null;
}

export async function getBrowserForProvider(
  provider: BrowserProviderName,
  options?: { headless?: boolean },
): Promise<{ browser: any; engine: BrowserEngine }> {
  const { chromium } = await import("playwright");
  if (provider === "linkedin" || provider === "indeed") {
    const edgePath = detectEdgePath();
    if (edgePath) {
      const launchOptions: any = {
        executablePath: edgePath,
        headless: options?.headless ?? true,
      };
      const userDataDir = process.env.EDGE_USER_DATA_DIR;
      if (userDataDir) {
        launchOptions.args = [`--user-data-dir=${userDataDir}`];
      }
      const browser = await chromium.launch(launchOptions);
      return { browser, engine: "edge" };
    }
  }
  const browser = await chromium.launch({ headless: options?.headless ?? true });
  return { browser, engine: "chromium" };
}
