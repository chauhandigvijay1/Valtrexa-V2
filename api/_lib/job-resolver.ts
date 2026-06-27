import { getProvider } from "./providers.js";
import type { ImportedJob } from "./job-sources.js";
import { supabaseAdmin } from "./supabase.js";
import { isProviderEnabled } from "./provider-controls.js";
import { getCookie } from "./provider-cookies.js";

export type SourceRequest =
  | { source: "greenhouse"; boardToken: string }
  | { source: "lever"; site: string }
  | { source: "ashby"; boardUrl: string }
  | { source: "workable"; boardUrl?: string; subdomain?: string; apiKey?: string }
  | {
      source: "linkedin" | "naukri" | "wellfound" | "indeed" | "instahyre";
      searchUrl: string;
      headers?: Record<string, string>;
    };

export async function hydrateSource(
  userId: string,
  source: Record<string, any>,
): Promise<SourceRequest> {
  const integrationResult = await supabaseAdmin
    .from("integrations")
    .select("config,enabled")
    .eq("user_id", userId)
    .eq("provider", source.source)
    .maybeSingle();

  const config = (integrationResult.data?.config ?? {}) as Record<string, string>;

  switch (source.source) {
    case "greenhouse":
      return { source: "greenhouse", boardToken: source.boardToken || config.board_token || "" };
    case "lever":
      return { source: "lever", site: source.site || config.site || "" };
    case "ashby":
      return { source: "ashby", boardUrl: source.boardUrl || config.board_url || "" };
    case "workable":
      return {
        source: "workable",
        boardUrl: source.boardUrl || config.board_url || "",
        subdomain: source.subdomain || config.subdomain || "",
        apiKey: source.apiKey || config.api_key || undefined,
      };
    default: {
      let cookie = "";
      const fromDB = await getCookie(userId, source.source);
      if (fromDB) cookie = fromDB.cookie;
      if (!cookie) cookie = config.session_cookie || config.cookie || "";
      return {
        source: source.source,
        searchUrl: source.searchUrl || config.search_url || "",
        headers: {
          ...(source.headers ?? {}),
          ...(cookie ? { cookie } : {}),
        },
      };
    }
  }
}

export async function resolveSourceJobs(
  userId: string,
  source: Record<string, any>,
): Promise<ImportedJob[]> {
  const providerName = String(source.source ?? "").toLowerCase();
  const scrapedProviders = ["linkedin", "indeed", "naukri", "wellfound", "instahyre"];
  if (scrapedProviders.includes(providerName)) {
    const enabled = await isProviderEnabled(providerName as any, userId);
    if (!enabled) {
      return [];
    }
  }
  const hydrated = await hydrateSource(userId, source);
  const provider = getProvider(hydrated.source);
  const config: Record<string, any> =
    "boardToken" in hydrated
      ? { boardToken: hydrated.boardToken }
      : "site" in hydrated
        ? { site: hydrated.site }
        : "boardUrl" in hydrated && hydrated.source === "ashby"
          ? { boardUrl: hydrated.boardUrl }
          : "boardUrl" in hydrated && hydrated.source === "workable"
            ? {
                boardUrl: hydrated.boardUrl,
                subdomain: (hydrated as any).subdomain,
                apiKey: (hydrated as any).apiKey,
              }
            : { searchUrl: (hydrated as any).searchUrl, headers: (hydrated as any).headers };
  const result = await provider.importJobs(config);
  return result.jobs;
}
