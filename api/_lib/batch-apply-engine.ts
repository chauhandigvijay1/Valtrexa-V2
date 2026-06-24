/**
 * A8 — Batch Apply Engine.
 *
 * Three strategies gate which jobs are eligible for automated submission:
 *
 *   conservative: Tier A only, easy-apply only, freshness ≤ 3d, approval required.
 *   balanced:     Tier A + B, easy-apply preferred, freshness ≤ 7d, approval default on.
 *   aggressive:   Tier A + B + C, any job, freshness ≤ 30d, approval optional.
 *
 * Every action is stored in batch_apply_runs + batch_apply_items, and each
 * individual application flows through the single Apply Engine (A7) so the
 * "primary resume only" rule is enforced uniformly.
 */

import { supabaseAdmin } from "./supabase.js";
import { emitWorkflowEvent } from "./workflow-events.js";
import { buildApplicationPackage, submitApplication } from "./apply-engine.js";
import { notifyBatchApplyApproval } from "./telegram.js";
import { isProviderEnabled } from "./provider-controls.js";

export type BatchStrategy = "conservative" | "balanced" | "aggressive";

export type BatchFilters = {
  minScore?: number;
  tier?: string[];
  source?: string[];
  workMode?: string[];
  freshness?: string[];
  easyApplyOnly?: boolean;
  companySize?: string[];
};

type StrategyConfig = {
  tiers: string[];
  easyApplyOnly: boolean;
  freshness: string[];
  approvalDefault: boolean;
  minMatchScore: number;
};

export const STRATEGY_CONFIG: Record<BatchStrategy, StrategyConfig> = {
  conservative: {
    tiers: ["A"],
    easyApplyOnly: true,
    freshness: ["24h", "3d"],
    approvalDefault: true,
    minMatchScore: 85,
  },
  balanced: {
    tiers: ["A", "B"],
    easyApplyOnly: false,
    freshness: ["24h", "3d", "7d"],
    approvalDefault: true,
    minMatchScore: 70,
  },
  aggressive: {
    tiers: ["A", "B", "C"],
    easyApplyOnly: false,
    freshness: ["24h", "3d", "7d", "30d"],
    approvalDefault: false,
    minMatchScore: 50,
  },
};

export type BatchRunSummary = {
  batchId: string;
  strategy: BatchStrategy;
  approvalMode: boolean;
  eligible: number;
  submitted: number;
  skipped: number;
  failed: number;
  items: Array<{ jobId: string; applicationId: string | null; status: string; reason?: string }>;
};

/** Resolve the set of jobs eligible under the chosen strategy + user filters. */
export async function resolveEligibleJobs(
  userId: string,
  strategy: BatchStrategy,
  filters: BatchFilters,
): Promise<
  {
    id: string;
    title: string;
    company_name: string | null;
    url: string | null;
    match_score: number | null;
    tier: string;
    easy_apply: boolean | null;
    freshness_bucket: string | null;
  }[]
> {
  const config = STRATEGY_CONFIG[strategy];

  // Jobs with no existing application for this user.
  const { data: existingAppJobIds } = await supabaseAdmin
    .from("applications")
    .select("job_id")
    .eq("user_id", userId)
    .not("job_id", "is", null);
  const appliedJobIds = new Set((existingAppJobIds ?? []).map((r: any) => String(r.job_id)));

  // Check which providers are enabled
  const enabledSources = (
    [
      "linkedin",
      "indeed",
      "naukri",
      "wellfound",
      "instahyre",
      "greenhouse",
      "lever",
      "ashby",
      "workable",
    ] as const
  ).filter((s) => (filters.source?.length ? filters.source.includes(s) : true));
  // Filter to only enabled providers
  const activeSources: string[] = [];
  for (const s of enabledSources) {
    if (await isProviderEnabled(s as any)) activeSources.push(s);
  }

  let query = supabaseAdmin
    .from("jobs")
    .select(
      "id, title, company_name, url, match_score, easy_apply, freshness_bucket, status, source",
    )
    .eq("user_id", userId)
    .in("status", ["open"]);
  if (activeSources.length) query = query.in("source", activeSources);
  if (filters.workMode?.length) query = query.in("work_mode", filters.workMode);
  if (filters.companySize?.length) query = query.in("company_size", filters.companySize);

  const { data, error } = await query.order("match_score", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((job: any) => !appliedJobIds.has(String(job.id)))
    .map((job: any) => {
      const score = Number(job.match_score ?? 0);
      const tier = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
      return { ...job, tier };
    })
    .filter((job: any) => {
      if (!config.tiers.includes(job.tier)) return false;
      const minScore = filters.minScore ?? config.minMatchScore;
      if (job.match_score == null || job.match_score < minScore) return false;
      if (config.easyApplyOnly && filters.easyApplyOnly !== false && !job.easy_apply) return false;
      if (filters.easyApplyOnly && !job.easy_apply) return false;
      const allowedFreshness = filters.freshness?.length ? filters.freshness : config.freshness;
      if (job.freshness_bucket && !allowedFreshness.includes(job.freshness_bucket)) return false;
      if (filters.tier?.length && !filters.tier.includes(job.tier)) return false;
      return true;
    });
}

export async function runBatchApply(input: {
  userId: string;
  strategy: BatchStrategy;
  filters?: BatchFilters;
  approvalMode?: boolean;
}): Promise<BatchRunSummary> {
  const filters = input.filters ?? {};
  const config = STRATEGY_CONFIG[input.strategy];
  const approvalMode = input.approvalMode ?? config.approvalDefault;

  const eligible = await resolveEligibleJobs(input.userId, input.strategy, filters);

  // Create the run record.
  const runInsert = await supabaseAdmin
    .from("batch_apply_runs")
    .insert({
      user_id: input.userId,
      strategy: input.strategy,
      status: approvalMode ? "queued" : "running",
      approval_mode: approvalMode,
      filters: filters as any,
      job_ids: eligible.map((j) => j.id),
      started_at: approvalMode ? null : new Date().toISOString(),
    } as any)
    .select("*")
    .single();
  if (runInsert.error) throw new Error(runInsert.error.message);
  const batchId = runInsert.data.id;

  // Approval mode: persist items as pending and stop — the user must approve.
  if (approvalMode) {
    const items = eligible.map((job) => ({
      batch_id: batchId,
      user_id: input.userId,
      job_id: job.id,
      status: "pending",
      payload: { title: job.title, company_name: job.company_name, tier: job.tier },
    }));
    if (items.length) {
      await supabaseAdmin.from("batch_apply_items").insert(items as any);
      const { data: createdItems } = await supabaseAdmin
        .from("batch_apply_items")
        .select("id")
        .eq("batch_id", batchId);
      const itemsForNotification = (createdItems ?? []).map((ci: any, i: number) => ({
        id: ci.id,
        jobTitle: eligible[i]?.title ?? "Unknown",
        company: eligible[i]?.company_name ?? "Unknown",
      }));
      await notifyBatchApplyApproval(
        input.userId,
        batchId,
        itemsForNotification.length,
        itemsForNotification,
      );
    }
    await emitWorkflowEvent({
      userId: input.userId,
      eventType: "batch_apply_queued",
      entityType: "batch_apply_runs",
      entityId: batchId,
      payload: { strategy: input.strategy, eligible: eligible.length },
    });
    return {
      batchId,
      strategy: input.strategy,
      approvalMode,
      eligible: eligible.length,
      submitted: 0,
      skipped: 0,
      failed: 0,
      items: eligible.map((j) => ({ jobId: j.id, applicationId: null, status: "pending" })),
    };
  }

  // No approval — execute immediately via the single Apply Engine.
  return executeBatch(input.userId, batchId, input.strategy, eligible);
}

/** Execute the batch: create application rows + packages, then submit each. */
export async function executeBatch(
  userId: string,
  batchId: string,
  strategy: BatchStrategy,
  eligible: Array<{
    id: string;
    title: string;
    company_name: string | null;
    url: string | null;
    tier: string;
  }>,
): Promise<BatchRunSummary> {
  let submitted = 0;
  let skipped = 0;
  let failed = 0;
  const items: BatchRunSummary["items"] = [];

  await supabaseAdmin
    .from("batch_apply_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", batchId);

  for (const job of eligible) {
    try {
      // Create application row (status saved until submit succeeds).
      const appInsert = await supabaseAdmin
        .from("applications")
        .insert({
          user_id: userId,
          job_id: job.id,
          company_name: job.company_name ?? "Unknown",
          role_title: job.title,
          status: "saved",
          source: "batch_apply",
        })
        .select("*")
        .single();
      if (appInsert.error || !appInsert.data) {
        failed += 1;
        items.push({
          jobId: job.id,
          applicationId: null,
          status: "failed",
          reason: appInsert.error?.message,
        });
        await recordBatchItem(batchId, userId, job, null, "failed", appInsert.error?.message);
        continue;
      }
      const applicationId = appInsert.data.id;

      await buildApplicationPackage({
        userId,
        jobId: job.id,
        applicationId,
        companyName: job.company_name ?? "Unknown",
      });

      const result = await submitApplication({ userId, applicationId, jobId: job.id });
      const status = result.success
        ? "submitted"
        : result.status === "SKIPPED"
          ? "skipped"
          : "failed";
      if (result.success) submitted += 1;
      else if (status === "skipped") skipped += 1;
      else failed += 1;

      await recordBatchItem(
        batchId,
        userId,
        job,
        applicationId,
        status,
        result.success ? undefined : result.status,
      );
      items.push({
        jobId: job.id,
        applicationId,
        status,
        reason: result.success ? undefined : result.status,
      });
    } catch (err: any) {
      failed += 1;
      items.push({ jobId: job.id, applicationId: null, status: "failed", reason: err?.message });
      await recordBatchItem(batchId, userId, job, null, "failed", err?.message);
    }
  }

  await supabaseAdmin
    .from("batch_apply_runs")
    .update({
      status: failed === eligible.length && submitted === 0 ? "failed" : "completed",
      submitted_count: submitted,
      skipped_count: skipped,
      failed_count: failed,
      finished_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  await emitWorkflowEvent({
    userId,
    eventType: "batch_apply_completed",
    entityType: "batch_apply_runs",
    entityId: batchId,
    payload: { strategy, submitted, skipped, failed, total: eligible.length },
  });

  return {
    batchId,
    strategy,
    approvalMode: false,
    eligible: eligible.length,
    submitted,
    skipped,
    failed,
    items,
  };
}

async function recordBatchItem(
  batchId: string,
  userId: string,
  job: { id: string; title: string; company_name: string | null; url: string | null },
  applicationId: string | null,
  status: string,
  reason?: string,
) {
  await supabaseAdmin.from("batch_apply_items").insert({
    batch_id: batchId,
    user_id: userId,
    job_id: job.id,
    application_id: applicationId,
    status,
    reason,
    tracking_url: job.url ?? null,
    payload: { title: job.title, company_name: job.company_name },
  } as any);
}
