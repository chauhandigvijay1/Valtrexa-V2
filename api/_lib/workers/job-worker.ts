import { getProvider } from "../providers.js";
import { supabaseAdmin } from "../supabase.js";
import { buildJobMetadata } from "./job-metadata.js";

export type JobImportPayload = {
  userId: string;
  sources: Array<Record<string, unknown>>;
};

/** Inline handler — runs the same import logic as the synchronous API path. */
export async function importJobsInline(payload: JobImportPayload) {
  let importedCount = 0;
  const imported: any[] = [];

  for (const source of payload.sources ?? []) {
    const providerName = String(source.source);
    const provider = getProvider(providerName);
    const config: Record<string, any> = {
      ...source,
      headers: source.headers ?? {},
    };

    if (!config.searchUrl) {
      const { data: integration } = await supabaseAdmin
        .from("integrations")
        .select("config")
        .eq("user_id", payload.userId)
        .eq("provider", providerName)
        .maybeSingle();
      if (integration?.config) {
        const cfg = integration.config as Record<string, string>;
        config.searchUrl = cfg.search_url ?? "";
        if (cfg.cookie || cfg.session_cookie) {
          config.headers = { ...config.headers, cookie: cfg.cookie || cfg.session_cookie };
        }
      }
    }
    const result = await provider.importJobs(config);
    for (const job of result.jobs) {
      const metadata = buildJobMetadata(job);
      const upsert = await supabaseAdmin
        .from("jobs")
        .upsert(
          {
            user_id: payload.userId,
            title: job.title,
            company_name: job.companyName,
            location: job.location,
            url: job.url,
            source: job.source,
            source_type: job.source,
            source_url: job.url,
            description: job.description,
            posted_at: job.postedAt,
            external_id: job.externalId,
            raw_payload: job.rawPayload,
            provider: job.source,
            normalized_roles: metadata.normalized_roles,
            experience_level: metadata.experience_level,
            work_mode: metadata.work_mode,
            salary_min: metadata.salaryMin,
            salary_max: metadata.salaryMax,
            company_size: metadata.company_size,
            freshness_bucket: metadata.freshness_bucket,
            easy_apply: metadata.easy_apply,
            status: "open",
            priority: "medium",
          } as any,
          { onConflict: "user_id,source,external_id" },
        )
        .select("*");
      if (!upsert.error) {
        importedCount += upsert.data?.length ?? 0;
        imported.push(...(upsert.data ?? []));
      }
    }
  }
  return { importedCount, jobs: imported };
}
