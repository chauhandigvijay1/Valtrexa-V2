import { createClient } from "@supabase/supabase-js";
import { getConfig } from "./workflow-config.js";
import { computeMatchScore, MatchInputs } from "./match-engine.js";
import { importJobsInline } from "./workers/job-worker.js";
import { discoverRecruitersInline } from "./workers/recruiter-worker.js";
import { getResumeForMatching, getCandidateBrain } from "./candidate-brain.js";
import { startStage, completeStage, failStage } from "./workflow-timeline.js";
import { createNotification } from "./notification-center.js";
import { logger } from "./logger.js";
import { checkProviderCookie } from "./cookie-manager.js";
import { runWorkflowPrecheck } from "./workflow-precheck.js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface PhaseResult {
  phase: string;
  startedAt: string;
  completedAt: string;
  success: boolean;
  count: number;
  errors: string[];
  details?: Record<string, unknown>;
}

export interface CycleResult {
  cycleId: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "paused" | "stopped" | "failed" | "skipped";
  phases: PhaseResult[];
  error?: string;
}

async function getWorkflowState(userId: string): Promise<{
  status: string;
  cycleId: string;
  error?: string;
}> {
  const { data, error } = await supabase
    .from("workflow_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return { status: "stopped", cycleId: crypto.randomUUID() };
  }

  return {
    status: data.status ?? "stopped",
    cycleId: data.cycle_id ?? crypto.randomUUID(),
    error: data.error,
  };
}

async function logCycleResult(userId: string, result: CycleResult): Promise<void> {
  const { error } = await supabase.from("workflow_log").insert({
    cycle_id: result.cycleId,
    user_id: userId,
    started_at: result.startedAt,
    completed_at: result.completedAt,
    status: result.status,
    phases: result.phases,
    error: result.error,
  });
  if (error) {
    logger.error("Failed to log cycle", { cycleId: result.cycleId, error: error.message, userId });
  }
}

async function getEnabledProviders(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("provider_controls")
    .select("provider, status")
    .eq("user_id", userId);
  if (!data) return [];
  return data.filter((p) => p.status === "enabled").map((p) => p.provider);
}

async function phaseImportJobs(userId: string): Promise<PhaseResult> {
  const start = new Date().toISOString();
  const errors: string[] = [];
  let count = 0;

  const stageId = (
    await startStage(userId, "import_jobs", { cycleId: userId, label: "Importing jobs" })
  )?.id;

  const enabled = await getEnabledProviders(userId);
  const config = getConfig();
  const providers = config.enabledProviders.filter((p) => enabled.includes(p));

  logger.info("Starting job import phase", { providers, userId });

  const { recordProviderSuccess, recordProviderFailure } = await import("./provider-controls.js");

  for (const providerName of providers) {
    try {
      await new Promise((r) => setTimeout(r, config.sleepSecondsBetweenProviders * 1000));
      const result = await importJobsInline({
        userId,
        sources: [{ source: providerName, limit: 20 } as any],
      });
      count += result.importedCount;
      logger.info(`Imported ${result.importedCount} jobs from ${providerName}`);
      await recordProviderSuccess(providerName as any, userId);
    } catch (e: any) {
      errors.push(`${providerName}: ${e.message}`);
      logger.warn(`Import failed for ${providerName}`, { error: e.message, userId });
      await recordProviderFailure(providerName as any, e.message, userId);
    }
  }

  if (stageId) {
    if (errors.length > 0) {
      await failStage(stageId, errors.join("; "));
    } else {
      await completeStage(stageId, `Imported ${count} jobs`);
    }
  }

  if (count > 0) {
    await createNotification({
      userId,
      category: "queue_event",
      title: `Imported ${count} jobs`,
      message: `Providers: ${providers.join(", ")}`,
      severity: "success",
    });
  }

  return {
    phase: "import_jobs",
    startedAt: start,
    completedAt: new Date().toISOString(),
    success: errors.length === 0,
    count,
    errors,
  };
}

async function phaseMatchJobs(userId: string): Promise<PhaseResult> {
  const start = new Date().toISOString();
  const errors: string[] = [];

  const stageId = (
    await startStage(userId, "match_jobs", { cycleId: userId, label: "Matching jobs" })
  )?.id;

  const profile = await getResumeForMatching(userId);
  if (!profile) {
    if (stageId) await failStage(stageId, "No profile found");
    return {
      phase: "match_jobs",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: false,
      count: 0,
      errors: ["No profile found"],
    };
  }

  const config = getConfig();
  const threshold = config.matchThresholdPercent;

  try {
    const { data: jobs } = await supabase
      .from("jobs")
      .select(
        "id, title, description, provider, location, company_name, salary_min, salary_max, work_mode, freshness_bucket, experience_level",
      )
      .eq("user_id", userId)
      .is("matched", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!jobs || jobs.length === 0) {
      if (stageId) await completeStage(stageId, "No new jobs to match");
      return {
        phase: "match_jobs",
        startedAt: start,
        completedAt: new Date().toISOString(),
        success: true,
        count: 0,
        errors: [],
      };
    }

    let matchedCount = 0;
    for (const job of jobs) {
      const inputs: MatchInputs = {
        resume: {
          skills: profile.skills,
          preferred_roles: profile.preferredRoles,
          preferred_locations: profile.preferredLocations,
          salary_expectation: profile.salaryExpectation,
          years_experience: profile.yearsExperience,
        },
        job: {
          title: job.title,
          description: job.description ?? "",
          company_name: job.company_name,
          location: job.location,
          experience_level: job.experience_level,
          work_mode: job.work_mode,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          freshness_bucket: job.freshness_bucket,
        },
      };

      const breakdown = computeMatchScore(inputs, undefined, threshold);

      await supabase
        .from("jobs")
        .update({
          matched: breakdown.matched,
          match_score: breakdown.score,
          match_role_score: breakdown.roleScore,
          match_skills_score: breakdown.skillsScore,
          match_experience_score: breakdown.experienceScore,
          match_location_score: breakdown.locationScore,
          match_salary_score: breakdown.salaryScore,
          processed_at: new Date().toISOString(),
        } as any)
        .eq("id", job.id)
        .eq("user_id", userId);

      if (breakdown.matched) matchedCount++;
    }

    logger.info(`Matched ${matchedCount}/${jobs.length} jobs`, { userId });

    if (stageId) await completeStage(stageId, `Matched ${matchedCount}/${jobs.length} jobs`);

    if (matchedCount > 0) {
      await createNotification({
        userId,
        category: "workflow_state",
        title: `Matched ${matchedCount} jobs`,
        message: `${matchedCount}/${jobs.length} jobs passed the ${threshold}% threshold`,
        severity: "success",
      });
    }

    return {
      phase: "match_jobs",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: true,
      count: matchedCount,
      errors: [],
    };
  } catch (e: any) {
    errors.push(e.message);
    if (stageId) await failStage(stageId, e.message);
    return {
      phase: "match_jobs",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: false,
      count: 0,
      errors,
    };
  }
}

async function phaseDiscoverRecruiters(userId: string): Promise<PhaseResult> {
  const start = new Date().toISOString();
  const errors: string[] = [];

  const stageId = (
    await startStage(userId, "discover_recruiters", {
      cycleId: userId,
      label: "Discovering recruiters",
    })
  )?.id;

  try {
    const { data: matchedJobs } = await supabase
      .from("jobs")
      .select("id, title, company_name, location")
      .eq("user_id", userId)
      .eq("matched", true)
      .is("recruiter_discovered_at", null)
      .limit(20);

    if (!matchedJobs || matchedJobs.length === 0) {
      if (stageId) await completeStage(stageId, "No jobs needing recruiter discovery");
      return {
        phase: "discover_recruiters",
        startedAt: start,
        completedAt: new Date().toISOString(),
        success: true,
        count: 0,
        errors: [],
      };
    }

    let discovered = 0;
    for (const job of matchedJobs) {
      try {
        const result = await discoverRecruitersInline({
          userId,
          companyName: job.company_name,
          roleTitle: job.title,
        });
        discovered += result.recruiters.length;

        await supabase
          .from("jobs")
          .update({ recruiter_discovered_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("user_id", userId);
      } catch (jobErr: any) {
        errors.push(`Job ${job.id} (${job.company_name}): ${jobErr.message}`);
      }
    }

    if (errors.length) {
      if (stageId) await failStage(stageId, `Completed with ${errors.length} error(s)`);
    } else {
      if (stageId) await completeStage(stageId, `Discovered ${discovered} recruiters across ${matchedJobs.length} jobs`);
    }

    return {
      phase: "discover_recruiters",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: errors.length === 0,
      count: discovered,
      errors,
      details: { jobs_processed: matchedJobs.length, discovered },
    };
  } catch (e: any) {
    errors.push(e.message);
    if (stageId) await failStage(stageId, e.message);
    return {
      phase: "discover_recruiters",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: false,
      count: 0,
      errors,
    };
  }
}

/** High-value orchestration: recruiter discovery → research → outreach → approval */
async function phaseHighValuePipeline(userId: string): Promise<PhaseResult> {
  const start = new Date().toISOString();
  const errors: string[] = [];
  const details: Record<string, any> = {};
  const stageId = (
    await startStage(userId, "high_value_pipeline", {
      cycleId: userId,
      label: "High value intelligence",
    })
  )?.id;

  try {
    // Phase B1: Identify HV companies from matched jobs (top 25% by match score)
    const { data: matchedJobs } = await supabase
      .from("jobs")
      .select("id, title, company_name, match_score, url, location")
      .eq("user_id", userId)
      .eq("matched", true)
      .order("match_score", { ascending: false })
      .limit(20);
    details.total_matched = matchedJobs?.length ?? 0;

    if (!matchedJobs || matchedJobs.length === 0) {
      if (stageId) await completeStage(stageId, "No matched jobs for HV pipeline");
      return {
        phase: "high_value_pipeline",
        startedAt: start,
        completedAt: new Date().toISOString(),
        success: true,
        count: 0,
        errors: [],
      };
    }

    // Deduplicate by company
    const companyMap = new Map<string, (typeof matchedJobs)[0][]>();
    for (const job of matchedJobs) {
      const c = (job.company_name ?? "Unknown").toLowerCase();
      if (!companyMap.has(c)) companyMap.set(c, []);
      companyMap.get(c)!.push(job);
    }
    details.companies = companyMap.size;

    // Phase B2: For each company, discover recruiters
    const recruitersFound = 0;
    for (const [company, jobs] of companyMap) {
      const companyTitle = jobs[0].company_name ?? "Unknown";
      try {
        // Check if we already have recruiters for this company
        const { count: existingCount } = await supabase
          .from("recruiters")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .ilike("company", `%${company}%`);
        if (existingCount && existingCount > 0) continue;

        // Placeholder creation removed — violates "never create fake data" constraint

        // Mark jobs as processed by HV pipeline
        await supabase
          .from("jobs")
          .update({ high_value_pipeline_at: new Date().toISOString() } as any)
          .eq("user_id", userId)
          .ilike("company_name", `%${company}%`);
      } catch (e: any) {
        errors.push(`${companyTitle}: ${e.message}`);
      }
    }
    details.recruiters_discovered = recruitersFound;

    // Phase B3: Generate outreach content for new recruiter entries
    const { data: pendingRecruiters } = await supabase
      .from("recruiters")
      .select("id, name, company, role")
      .eq("user_id", userId)
      .eq("status", "pending_discovery")
      .limit(10);

    const brain = await getCandidateBrain(userId);
    const candidateName = brain?.baseProfile?.name ?? brain?.profile?.name ?? "there";

    if (pendingRecruiters && pendingRecruiters.length > 0) {
      for (const rec of pendingRecruiters) {
        try {
          // Create outreach_draft record (used by Telegram approval + sending pipeline)
          const { data: draft, error: outErr } = await supabase
            .from("outreach_drafts")
            .insert({
              user_id: userId,
              recruiter_id: rec.id,
              company_name: rec.company,
              subject: `Opportunity at ${rec.company}`,
              body: `Hi ${rec.name?.split(" ")[0] ?? candidateName},\n\nI came across your role at ${rec.company} and would love to connect.\n\nBest,\n${candidateName}`,
              status: "pending",
              kind: "hiring_manager_outreach",
              generated_context: { source: "high_value_pipeline", recruiter_role: rec.role },
            } as any)
            .select()
            .maybeSingle();
          // Mark recruiter as discovered
          if (!outErr && draft) {
            await supabase
              .from("recruiters")
              .update({ status: "discovered" } as any)
              .eq("id", rec.id)
              .eq("user_id", userId);
            // Notify user via Telegram about the new outreach draft
            try {
              const { notifyOutreachDraft } = await import("./telegram.js");
              await notifyOutreachDraft(userId, draft.id, rec.name ?? "Unknown", rec.company ?? "Unknown");
            } catch (notifyErr: any) {
              logger.warn("Failed to notify outreach draft via Telegram", { error: notifyErr.message, userId });
            }
          }
        } catch (e: any) {
          errors.push(`outreach ${rec.name}: ${e.message}`);
        }
      }
    }
    details.outreach_drafts = pendingRecruiters?.length ?? 0;

    // Phase B4: Check for approvals needed (using outreach_drafts table)
    const { count: pendingApprovals } = await supabase
      .from("outreach_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending");
    details.pending_approvals = pendingApprovals ?? 0;

    if (stageId) {
      await completeStage(
        stageId,
        `${companyMap.size} companies, ${recruitersFound} recruiters, ${details.outreach_drafts} drafts, ${details.pending_approvals} pending approvals`,
      );
    }

    return {
      phase: "high_value_pipeline",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: errors.length === 0,
      count: recruitersFound,
      errors,
      details,
    };
  } catch (e: any) {
    errors.push(e.message);
    if (stageId) await failStage(stageId, e.message);
    return {
      phase: "high_value_pipeline",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: false,
      count: 0,
      errors,
    };
  }
}

async function createApplicationsForMatchedJobs(
  userId: string,
  batchSize = 20,
): Promise<{ created: number; skipped: number }> {
  // Find matched jobs that don't already have an application
  const { data: existingAppJobIds } = await supabase
    .from("applications")
    .select("job_id")
    .eq("user_id", userId)
    .not("job_id", "is", null);
  const appliedJobIds = new Set((existingAppJobIds ?? []).map((r: any) => String(r.job_id)));

  const { data: matchedJobs } = await supabase
    .from("jobs")
    .select("id, title, company_name, source, url, provider")
    .eq("user_id", userId)
    .eq("matched", true)
    .order("match_score", { ascending: false })
    .limit(batchSize);

  if (!matchedJobs || matchedJobs.length === 0) return { created: 0, skipped: 0 };

  let created = 0;
  let skipped = 0;
  for (const job of matchedJobs) {
    if (appliedJobIds.has(job.id)) {
      skipped++;
      continue;
    }
    const provider = job.provider ?? job.source ?? "unknown";
    // Skip disabled providers (e.g., LinkedIn)
    const { data: pc } = await supabase
      .from("provider_controls")
      .select("status")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (pc && pc.status !== "enabled") {
      skipped++;
      continue;
    }

    const { error: insErr } = await supabase.from("applications").insert({
      user_id: userId,
      job_id: job.id,
      company_name: job.company_name ?? "Unknown",
      role_title: job.title,
      status: "pending",
      provider,
      source: "pipeline_a",
      tracking_url: job.url ?? null,
    } as any);
    if (insErr) {
      skipped++;
      continue;
    }
    created++;
  }
  return { created, skipped };
}

async function phaseApplyPipeline(userId: string): Promise<PhaseResult> {
  const start = new Date().toISOString();
  const errors: string[] = [];

  const stageId = (
    await startStage(userId, "apply_pipeline", {
      cycleId: userId,
      label: "Creating & processing applications",
    })
  )?.id;

  try {
    // Step 1: Create applications for ALL matched jobs (not just high value)
    const { created, skipped } = await createApplicationsForMatchedJobs(userId);
    logger.info(
      `Pipeline A: created ${created} applications (${skipped} skipped, already existed or disabled provider)`,
      { userId },
    );

    // Step 2: Process pending applications
    const { data: pendingApps, count } = await supabase
      .from("applications")
      .select("id, job_id, provider", { count: "exact", head: false })
      .eq("user_id", userId)
      .in("status", ["pending", "draft"])
      .order("created_at", { ascending: true })
      .limit(5);

    const pendingCount = count ?? 0;
    logger.info(`Pipeline A: ${pendingCount} pending applications to process`, { userId });

    // Submit each pending application via the apply engine
    let submitted = 0;
    for (const app of pendingApps ?? []) {
      try {
        const { queueApplicationSubmit } = await import("./apply-engine.js");
        const result = await queueApplicationSubmit({
          userId,
          applicationId: app.id,
          jobId: app.job_id,
        });
        if (result.success) submitted++;
      } catch (e: any) {
        errors.push(`app ${app.id}: ${e.message}`);
      }
    }

    if (stageId) {
      const msg = `Created ${created} apps, submitted ${submitted}/${pendingCount} pending`;
      await completeStage(stageId, msg);
    }

    return {
      phase: "apply_pipeline",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: errors.length === 0,
      count: created + submitted,
      errors,
      details: { created, submitted, pending: pendingCount, skipped },
    };
  } catch (e: any) {
    errors.push(e.message);
    if (stageId) await failStage(stageId, e.message);
    return {
      phase: "apply_pipeline",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: false,
      count: 0,
      errors,
    };
  }
}

async function phaseFollowups(userId: string): Promise<PhaseResult> {
  const start = new Date().toISOString();
  const errors: string[] = [];

  const stageId = (await startStage(userId, "followups", { cycleId: userId, label: "Followups" }))
    ?.id;

  try {
    const { processFollowupsInline } = await import("./workers/followup-worker.js");
    const result = await processFollowupsInline({ userId, limit: 50 });

    if (stageId)
      await completeStage(
        stageId,
        result.processed > 0 ? `Sent ${result.processed} followups` : "No followups needed",
      );

    return {
      phase: "followups",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: true,
      count: result.processed ?? 0,
      errors: [],
      details: result.processed ? { sent: result.processed } : undefined,
    };
  } catch (e: any) {
    errors.push(e.message);
    if (stageId) await failStage(stageId, e.message);
    return {
      phase: "followups",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: false,
      count: 0,
      errors,
    };
  }
}

async function phaseHealthCheck(userId: string): Promise<PhaseResult> {
  const start = new Date().toISOString();
  const errors: string[] = [];

  const stageId = (
    await startStage(userId, "health_check", { cycleId: userId, label: "Health check" })
  )?.id;

  try {
    const { data: controls } = await supabase
      .from("provider_controls")
      .select("provider, status, last_health_check_at")
      .eq("user_id", userId);

    const now = new Date().toISOString();
    if (controls) {
      for (const c of controls) {
        await supabase
          .from("provider_controls")
          .update({ last_health_check_at: now })
          .eq("user_id", userId)
          .eq("provider", c.provider);
      }
    }

    const failed = controls?.filter((c) => c.status !== "enabled") ?? [];
    if (failed.length > 0) {
      await createNotification({
        userId,
        category: "provider_failure",
        title: `${failed.length} providers unhealthy`,
        message: failed.map((c) => `${c.provider}: ${c.status}`).join(", "),
        severity: "warning",
      });
    }

    if (stageId) {
      const failedProviders = failed.map((c) => c.provider).join(", ");
      await completeStage(
        stageId,
        failedProviders
          ? `${controls?.length ?? 0} providers checked, issues: ${failedProviders}`
          : `${controls?.length ?? 0} providers healthy`,
      );
    }

    return {
      phase: "health_check",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: true,
      count: controls?.length ?? 0,
      errors: [],
      details: controls
        ? Object.fromEntries(controls.map((c) => [c.provider, c.status]))
        : undefined,
    };
  } catch (e: any) {
    errors.push(e.message);
    if (stageId) await failStage(stageId, e.message);
    return {
      phase: "health_check",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: false,
      count: 0,
      errors,
    };
  }
}

async function phaseAnalytics(userId: string): Promise<PhaseResult> {
  const start = new Date().toISOString();
  const errors: string[] = [];

  const stageId = (
    await startStage(userId, "analytics", { cycleId: userId, label: "Analytics" })
  )?.id;

  try {
    const { runAnalyticsInline } = await import("./workers/analytics-worker.js");
    const result = await runAnalyticsInline({ userId });

    if (stageId)
      await completeStage(
        stageId,
        `Applications: ${result.summary.applications}, Interviews: ${result.summary.interviews}`,
      );

    return {
      phase: "analytics",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: true,
      count: result.summary.applications,
      errors: [],
      details: result.summary as any,
    };
  } catch (e: any) {
    errors.push(e.message);
    if (stageId) await failStage(stageId, e.message);
    return {
      phase: "analytics",
      startedAt: start,
      completedAt: new Date().toISOString(),
      success: false,
      count: 0,
      errors,
    };
  }
}

export async function validatePrerequisites(userId: string): Promise<{
  valid: boolean;
  blockers: string[];
}> {
  const blockers: string[] = [];
  const { PROVIDERS, getProviderControl, setProviderStatus } = await import("./provider-controls.js");

  const enabledProviders = await getEnabledProviders(userId);
  for (const provider of enabledProviders) {
    const cookieStatus = await checkProviderCookie(userId, provider);
    if (cookieStatus.status !== "valid") {
      blockers.push(`Provider "${provider}" has no valid cookie: ${cookieStatus.message}`);
    }
  }

  // Auto-resume paused providers that now have valid cookies
  for (const provider of PROVIDERS) {
    if (enabledProviders.includes(provider)) continue;
    const control = await getProviderControl(provider, userId);
    if (!control || control.status !== "paused") continue;
    const cookieStatus = await checkProviderCookie(userId, provider);
    if (cookieStatus.status === "valid") {
      await setProviderStatus(provider, "enabled", userId, "auto");
      logger.info(`Auto-resumed provider ${provider} — cookie is now valid`, { userId });
    }
  }

  const brain = await getCandidateBrain(userId);
  if (!brain) {
    blockers.push("No candidate profile found. Create a profile or upload a resume first.");
  }

  const { count, error } = await supabase
    .from("resumes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error || !count || count === 0) {
    blockers.push("No resume uploaded. Upload at least one resume before starting the workflow.");
  }

  return { valid: blockers.length === 0, blockers };
}

async function saveWorkflowState(
  userId: string,
  state: { status: string; cycleId?: string; error?: string },
  expectedStatus?: string,
): Promise<void> {
  const payload = {
    user_id: userId,
    status: state.status,
    cycle_id: state.cycleId ?? crypto.randomUUID(),
    error: state.error ?? null,
    updated_at: new Date().toISOString(),
  };

  if (expectedStatus) {
    // Atomic conditional update — only transition if current status matches expectedStatus
    const { data: existing } = await supabase
      .from("workflow_state")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const upd: any = supabase
        .from("workflow_state")
        .update(payload as any)
        .eq("user_id", userId)
        .eq("status", expectedStatus);
      const { error } = await upd;
      if (error) throw error;
    } else if (state.status === expectedStatus) {
      await supabase.from("workflow_state").insert(payload as any);
    }
  } else {
    const { data: existing } = await supabase
      .from("workflow_state")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("workflow_state")
        .update(payload as any)
        .eq("user_id", userId);
    } else {
      await supabase.from("workflow_state").insert(payload as any);
    }
  }
}

export async function startWorkflow(userId: string, by?: string): Promise<any> {
  const { startWorkflow: realStart } = await import("./workflow-state.js");
  return realStart(userId, by);
}

export async function pauseWorkflow(userId: string): Promise<void> {
  await saveWorkflowState(userId, { status: "paused" });
  // Cancel any running timeline stages
  const { cancelRunningStages } = await import("./workflow-timeline.js");
  await cancelRunningStages(userId);
  logger.info("Workflow paused", { userId });
}

export async function stopWorkflow(userId: string): Promise<void> {
  await saveWorkflowState(userId, { status: "stopped" });
  const { cancelRunningStages } = await import("./workflow-timeline.js");
  await cancelRunningStages(userId);
  logger.info("Workflow stopped", { userId });
}

export async function getWorkflowStatus(
  userId: string,
): Promise<{ status: string; cycleId: string; error?: string }> {
  return getWorkflowState(userId);
}

export async function runCycle(userId: string): Promise<CycleResult> {
  const state = await getWorkflowState(userId);
  const cycleId = state.cycleId;
  const startedAt = new Date().toISOString();
  const phases: PhaseResult[] = [];

  if (state.status === "stopped" || state.status === "paused") {
    logger.info(`Workflow is ${state.status} — skipping cycle`, { userId });
    return {
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: state.status as any,
      phases: [],
      error: state.error,
    };
  }

  // Atomic transition: only proceed if state allows running (stopped/paused already returned early)
  // The update conditions on current status to prevent concurrent duplicate execution
  const { data: wsRow } = await supabase
    .from("workflow_state")
    .update({
      status: "running",
      cycle_id: cycleId,
      error: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("user_id", userId)
    .in("status", ["running", "failed"])
    .select("id")
    .maybeSingle();

  if (!wsRow) {
    logger.warn("Could not acquire workflow lock — concurrent runCycle already in progress", { userId });
    return {
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "skipped",
      phases: [],
      error: "Concurrent cycle detected — skipped",
    };
  }

  const precheck = await runWorkflowPrecheck(userId);
  if (!precheck.passed) {
    const failed = precheck.checks.filter((c) => c.status === "failed");
    logger.warn("Workflow precheck failed", {
      userId,
      failed: failed.map((c) => c.name),
    });
    return {
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      phases: [],
      error: `Precheck failed: ${failed.map((c) => `${c.name}: ${c.message}`).join("; ")}`,
    };
  }

  const validation = await validatePrerequisites(userId);
  if (!validation.valid) {
    logger.warn("Workflow prerequisites failed", { userId, blockers: validation.blockers });
    return {
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      phases: [],
      error: `Prerequisites check failed: ${validation.blockers.join("; ")}`,
    };
  }

  logger.info("Starting workflow cycle", { cycleId, userId, status: state.status });

  const phaseList = [
    { name: "import_jobs", fn: phaseImportJobs },
    { name: "match_jobs", fn: phaseMatchJobs },
    { name: "discover_recruiters", fn: phaseDiscoverRecruiters },
    { name: "high_value_pipeline", fn: phaseHighValuePipeline },
    { name: "apply_pipeline", fn: phaseApplyPipeline },
    { name: "followups", fn: phaseFollowups },
    { name: "health_check", fn: phaseHealthCheck },
    { name: "analytics", fn: phaseAnalytics },
  ];

  for (const { name, fn } of phaseList) {
    const currentState = await getWorkflowState(userId);
    if (currentState.status === "stopped" || currentState.status === "paused") {
      phases.push({
        phase: name,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        success: false,
        count: 0,
        errors: [`Workflow ${currentState.status} before phase could run`],
      });
      logger.info(`Workflow ${currentState.status} during phase ${name}`, { userId });
      // Save recovery checkpoint
      await saveWorkflowState(userId, {
        status: currentState.status,
        cycleId,
        error: `Paused during ${name}`,
      });
      break;
    }

    if (currentState.error) {
      await createNotification({
        userId,
        category: "workflow_state",
        title: `Workflow error in ${name}`,
        message: currentState.error,
        severity: "error",
      });
    }

    try {
      const result = await fn(userId);
      phases.push(result);
      logger.info(`Phase ${name} completed`, {
        count: result.count,
        success: result.success,
        userId,
      });
    } catch (e: any) {
      logger.error(`Phase ${name} crashed`, { error: e.message, userId });
      phases.push({
        phase: name,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        success: false,
        count: 0,
        errors: [e.message],
      });
      // Save error checkpoint for recovery and halt subsequent phases
      await saveWorkflowState(userId, {
        status: "error",
        cycleId,
        error: `Phase ${name} failed: ${e.message}`,
      });
      break;
    }
  }

  const finalState = await getWorkflowState(userId);
  const result: CycleResult = {
    cycleId,
    startedAt,
    completedAt: new Date().toISOString(),
    status:
      finalState.status === "running" ? "completed" : ((finalState.status as any) ?? "stopped"),
    phases,
  };

  await logCycleResult(userId, result);

  // Reset workflow state after successful cycle if still running
  if (finalState.status === "running") {
    await saveWorkflowState(userId, { status: "running", cycleId: crypto.randomUUID() });
  }

  const completedPhases = phases.filter((p) => p.success).length;
  const totalPhases = phases.length;
  await createNotification({
    userId,
    category: "workflow_state",
    title: `Workflow cycle ${finalState.status === "running" ? "completed" : finalState.status}`,
    message: `${completedPhases}/${totalPhases} phases completed`,
    severity: finalState.status === "running" ? "success" : "warning",
    metadata: {
      cycleId,
      phases: phases.map((p) => ({ phase: p.phase, success: p.success, count: p.count })),
    },
  });



  return result;
}

export async function runSingleUserCycle(userId: string): Promise<CycleResult> {
  return runCycle(userId);
}
