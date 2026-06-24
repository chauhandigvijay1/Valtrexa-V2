/**
 * Shared job-source resolver.
 *
 * Extracted from `api/[...route].ts` so both the synchronous import path and
 * the Phase A/B providers-import handler use the same credential-hydration
 * logic. No duplicate code.
 */

import { getProvider } from "./providers.js";
import type { ImportedJob } from "./job-sources.js";
import { supabaseAdmin } from "./supabase.js";

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

/** Build a provider config object from a raw request + saved integration row. */
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
    default:
      return {
        source: source.source,
        searchUrl: source.searchUrl || config.search_url || "",
        headers: {
          ...(source.headers ?? {}),
          ...(config.session_cookie ? { cookie: config.session_cookie } : {}),
          ...(config.cookie ? { cookie: config.cookie } : {}),
        },
      };
  }
}

export async function resolveSourceJobs(
  userId: string,
  source: Record<string, any>,
): Promise<ImportedJob[]> {
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
