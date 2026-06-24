import { supabaseAdmin } from "./supabase.js";
import { emitWorkflowEvent } from "./workflow-events.js";
import { getProvider } from "./providers.js";
import { computeMatchScore } from "./match-engine.js";
import { applyWithPlaywright, recordPlaywrightApplyResult } from "./playwright-apply.js";
import { notifyApplicationForApproval } from "./telegram.js";
import { enqueue } from "./queue.js";
import { isProviderEnabled } from "./provider-controls.js";

export type ApplyResult = {
  applicationId: string;
  status: string;
  provider: string;
  externalId?: string;
  trackingUrl?: string | null;
  success: boolean;
  error?: string | null;
};

export async function resolvePrimaryResume(userId: string): Promise<{ resumeId: string } | null> {
  const primary = await supabaseAdmin
    .from("resumes")
    .select("id")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (primary.data?.id) return { resumeId: primary.data.id };

  const latest = await supabaseAdmin
    .from("resumes")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return latest.data?.id ? { resumeId: latest.data.id } : null;
}

export async function buildApplicationPackage(input: {
  userId: string;
  jobId: string;
  applicationId: string;
  companyName: string;
}): Promise<{ tier: string; matchScore: number }> {
  const [jobRow, brainRow, resume] = await Promise.all([
    supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("id", input.jobId)
      .eq("user_id", input.userId)
      .maybeSingle(),
    supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", input.userId).maybeSingle(),
    resolvePrimaryResume(input.userId),
  ]);

  const job: any = jobRow.data ?? {};
  const brain: any = brainRow.data ?? {};
  const breakdown = computeMatchScore({
    resume: {
      skills: brain.parsed_resume?.skills ?? [],
      preferred_roles: brain.preferred_roles ?? [],
      preferred_locations: brain.preferred_locations ?? [],
      years_experience: brain.years_experience,
      salary_expectation: brain.salary_expectation,
    },
    job: {
      title: job.title ?? "",
      description: job.description ?? "",
      company_name: job.company_name,
      location: job.location,
      normalized_roles: job.normalized_roles,
      experience_level: job.experience_level,
      work_mode: job.work_mode,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      freshness_bucket: job.freshness_bucket,
      easy_apply: job.easy_apply,
    },
    companyQualityScore: null,
    recruiterAvailable: false,
  });
  const tier =
    breakdown.score >= 85 ? "A" : breakdown.score >= 70 ? "B" : breakdown.score >= 50 ? "C" : "D";

  await supabaseAdmin
    .from("applications")
    .update({
      tier,
      match_score: breakdown.score,
      package_generated: true,
      primary_resume_id: resume?.resumeId ?? null,
    } as any)
    .eq("id", input.applicationId)
    .eq("user_id", input.userId);

  await emitWorkflowEvent({
    userId: input.userId,
    eventType: "application_package_generated",
    entityType: "applications",
    entityId: input.applicationId,
    payload: {
      companyName: input.companyName,
      tier,
      matchScore: breakdown.score,
      primaryResumeId: resume?.resumeId ?? null,
    },
  });

  return { tier, matchScore: breakdown.score };
}

export async function submitApplication(input: {
  userId: string;
  applicationId: string;
  jobId: string;
}): Promise<ApplyResult> {
  const jobRow = await supabaseAdmin
    .from("jobs")
    .select("source, url, company_name, easy_apply, id as source_job_id")
    .eq("id", input.jobId)
    .eq("user_id", input.userId)
    .maybeSingle();
  const job: any = jobRow.data ?? null;
  const source = String(job?.source ?? "manual").toLowerCase();
  const jobUrl = job?.url ?? null;

  // Gate: check provider is enabled
  const scrapedProviders = ["linkedin", "indeed", "naukri", "wellfound", "instahyre"];
  if (scrapedProviders.includes(source) && !(await isProviderEnabled(source as any))) {
    return {
      applicationId: input.applicationId,
      status: "skipped",
      provider: source,
      success: false,
      externalId: undefined,
      error: `Provider "${source}" is disabled`,
    };
  }

  const nowIso = new Date().toISOString();

  if (
    jobUrl &&
    (source === "linkedin" ||
      source === "indeed" ||
      source === "naukri" ||
      source === "wellfound" ||
      source === "instahyre")
  ) {
    const [resume, brain] = await Promise.all([
      resolvePrimaryResume(input.userId),
      supabaseAdmin
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", input.userId)
        .maybeSingle(),
    ]);

    const approveFirst = process.env.ENABLE_TELEGRAM_APPROVALS === "true";

    if (approveFirst) {
      const pwResult = await applyWithPlaywright({
        userId: input.userId,
        applicationId: input.applicationId,
        jobId: input.jobId,
        jobUrl,
        provider: source as any,
        candidateData: { ...((brain.data || {}) as any), resumeUrl: resume?.resumeId },
        headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
        approvalMode: true,
      });

      await recordPlaywrightApplyResult({
        userId: input.userId,
        applicationId: input.applicationId,
        provider: source,
        result: pwResult,
      });

      if (pwResult.status === "REQUIRES_APPROVAL") {
        await supabaseAdmin
          .from("applications")
          .update({
            status: "saved",
            approval_status: "pending",
            approval_requested_at: nowIso,
            submitted_via: "playwright_approval",
          } as any)
          .eq("id", input.applicationId)
          .eq("user_id", input.userId);

        const jobTitle = job?.title || "Role";
        const companyName = job?.company_name || "Unknown";

        await notifyApplicationForApproval(
          input.userId,
          input.applicationId,
          jobTitle,
          companyName,
          jobUrl,
        );

        await emitWorkflowEvent({
          userId: input.userId,
          eventType: "application_approval_requested",
          entityType: "applications",
          entityId: input.applicationId,
          payload: { provider: source, jobTitle, companyName, jobUrl },
        });

        return {
          applicationId: input.applicationId,
          status: "REQUIRES_APPROVAL",
          provider: source,
          trackingUrl: jobUrl,
          success: true,
        };
      }

      await supabaseAdmin
        .from("applications")
        .update({
          status: pwResult.status === "APPLIED" ? "applied" : "saved",
          applied_at: pwResult.status === "APPLIED" ? nowIso : null,
          submitted_at: pwResult.status === "APPLIED" ? nowIso : null,
          provider: source,
          tracking_url: jobUrl,
          submitted_via: "playwright_automation",
        } as any)
        .eq("id", input.applicationId)
        .eq("user_id", input.userId);

      const success = pwResult.status === "APPLIED";
      return {
        applicationId: input.applicationId,
        status: success ? "SUCCESS" : pwResult.status,
        provider: source,
        externalId: pwResult.externalId,
        trackingUrl: jobUrl,
        success,
      };
    }

    const pwResult = await applyWithPlaywright({
      userId: input.userId,
      applicationId: input.applicationId,
      jobId: input.jobId,
      jobUrl,
      provider: source as any,
      candidateData: { ...((brain.data || {}) as any), resumeUrl: resume?.resumeId },
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
      approvalMode: false,
    });

    await recordPlaywrightApplyResult({
      userId: input.userId,
      applicationId: input.applicationId,
      provider: source,
      result: pwResult,
    });

    const success = pwResult.status === "APPLIED";

    await supabaseAdmin
      .from("applications")
      .update({
        status: success ? "applied" : "saved",
        applied_at: success ? nowIso : null,
        submitted_at: success ? nowIso : null,
        provider: source,
        tracking_url: jobUrl,
        submitted_via: "playwright_automation",
      } as any)
      .eq("id", input.applicationId)
      .eq("user_id", input.userId);

    await supabaseAdmin.from("application_events").insert({
      user_id: input.userId,
      application_id: input.applicationId,
      event_type: success ? "submitted" : "playwright_automation_attempted",
      description: `Playwright ${source}: ${pwResult.status} (${pwResult.submittedFields}/${pwResult.totalFields} fields)`,
      occurred_at: nowIso,
    });

    await emitWorkflowEvent({
      userId: input.userId,
      eventType: success ? "application_submitted" : "application_submission_failed",
      entityType: "applications",
      entityId: input.applicationId,
      payload: {
        provider: source,
        method: "playwright",
        status: pwResult.status,
        error: pwResult.error,
      },
    });

    return {
      applicationId: input.applicationId,
      status: success ? "SUCCESS" : pwResult.status,
      provider: source,
      externalId: pwResult.externalId,
      trackingUrl: jobUrl,
      success,
    };
  }

  let providerResult: { status: string; success: boolean; externalId?: string };

  try {
    const provider = getProvider(source);
    providerResult = await provider.submitApplication(input.applicationId, {
      jobUrl,
      companyName: job?.company_name ?? null,
    });
  } catch {
    providerResult = { status: "MANUAL_APPLY", success: true };
  }

  const success =
    providerResult.status === "SUCCESS" ||
    providerResult.status === "MANUAL_APPLY" ||
    providerResult.status === "MANUAL_APPLY_REQUIRED";

  await supabaseAdmin
    .from("applications")
    .update({
      status: success ? "applied" : "saved",
      applied_at: nowIso,
      submitted_at: nowIso,
      provider: source,
      tracking_url: jobUrl,
      submitted_via: "provider_api",
    } as any)
    .eq("id", input.applicationId)
    .eq("user_id", input.userId);

  await supabaseAdmin.from("application_events").insert({
    user_id: input.userId,
    application_id: input.applicationId,
    event_type: success ? "submitted" : "submission_failed",
    description: `Provider ${source}: ${providerResult.status}`,
    occurred_at: nowIso,
  });

  await emitWorkflowEvent({
    userId: input.userId,
    eventType: success ? "application_submitted" : "application_submission_failed",
    entityType: "applications",
    entityId: input.applicationId,
    payload: { provider: source, status: providerResult.status, trackingUrl: jobUrl },
  });

  return {
    applicationId: input.applicationId,
    status: providerResult.status,
    provider: source,
    externalId: providerResult.externalId,
    trackingUrl: jobUrl,
    success,
  };
}

export async function submitApprovedApplication(input: {
  userId: string;
  applicationId: string;
  jobId: string;
  jobUrl: string;
  provider: string;
}): Promise<ApplyResult> {
  const [resume, brain] = await Promise.all([
    supabaseAdmin
      .from("resumes")
      .select("id")
      .eq("user_id", input.userId)
      .eq("is_primary", true)
      .maybeSingle(),
    supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", input.userId).maybeSingle(),
  ]);
  const pwResult = await applyWithPlaywright({
    userId: input.userId,
    applicationId: input.applicationId,
    jobId: input.jobId,
    jobUrl: input.jobUrl,
    provider: input.provider as any,
    candidateData: { ...((brain.data || {}) as any), resumeUrl: resume?.data?.id },
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    approvalMode: false,
  });

  await recordPlaywrightApplyResult({
    userId: input.userId,
    applicationId: input.applicationId,
    provider: input.provider,
    result: pwResult,
  });

  const nowIso = new Date().toISOString();
  const success = pwResult.status === "APPLIED";

  await supabaseAdmin
    .from("applications")
    .update({
      status: success ? "applied" : "saved",
      applied_at: success ? nowIso : null,
      submitted_at: success ? nowIso : null,
      provider: input.provider,
      tracking_url: input.jobUrl,
      submitted_via: "playwright_automation_post_approval",
    } as any)
    .eq("id", input.applicationId)
    .eq("user_id", input.userId);

  await supabaseAdmin.from("application_events").insert({
    user_id: input.userId,
    application_id: input.applicationId,
    event_type: success ? "submitted" : "submission_failed",
    description: `Playwright post-approval submit (${input.provider}): ${pwResult.status}${pwResult.error ? ` — ${pwResult.error}` : ""}`,
    occurred_at: nowIso,
  });

  await emitWorkflowEvent({
    userId: input.userId,
    eventType: success ? "application_submitted" : "application_submission_failed",
    entityType: "applications",
    entityId: input.applicationId,
    payload: {
      provider: input.provider,
      method: "playwright_automation_post_approval",
      status: pwResult.status,
      evidenceIds: pwResult.evidenceIds,
      error: pwResult.error ?? null,
    },
  });

  return {
    applicationId: input.applicationId,
    status: success ? "SUCCESS" : pwResult.status,
    provider: input.provider,
    trackingUrl: input.jobUrl,
    success,
  };
}

export async function queueApplicationSubmit(input: {
  userId: string;
  applicationId: string;
  jobId: string;
}): Promise<ApplyResult> {
  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("status, approval_status, jobs!inner(source, url, company_name)")
    .eq("id", input.applicationId)
    .eq("user_id", input.userId)
    .single();

  const job: any = (app as any)?.jobs ?? {};
  const source = String(job?.source ?? "manual").toLowerCase();
  const jobUrl = job?.url ?? null;
  const companyName = job?.company_name ?? "Unknown";

  const { mode, jobId: qJobId } = await enqueue(
    "apply",
    "playwright-apply",
    {
      userId: input.userId,
      applicationId: input.applicationId,
      jobId: input.jobId,
      jobUrl,
      provider: source,
      companyName,
    },
    { userId: input.userId, attempts: 3 },
  );

  return {
    applicationId: input.applicationId,
    status: `QUEUED_${mode.toUpperCase()}`,
    provider: source,
    trackingUrl: jobUrl,
    success: true,
  };
}
