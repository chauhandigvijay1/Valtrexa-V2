/**
 * Phase A + B route handlers.
 *
 * Each handler validates the user, calls the relevant engine, and returns JSON.
 * These are wired into the main router in `api/[...route].ts`.
 */

import { requireApiUser } from "./_lib/auth.js";
import { json, methodNotAllowed, readJson, safeErrorMessage } from "./_lib/http.js";
import { logger } from "./_lib/logger.js";
import { computeMatchScore } from "./_lib/match-engine.js";
import { computeStrategicValue, computeStrategicValueWithAI } from "./_lib/high-value-engine.js";
import { discoverContactsViaAI, discoverContactsV3 } from "./_lib/recruiter-discovery.js";
import {
  buildApplicationPackage,
  submitApplication,
  resolvePrimaryResume,
} from "./_lib/apply-engine.js";
import {
  runBatchApply,
  resolveEligibleJobs,
  STRATEGY_CONFIG,
  type BatchStrategy,
} from "./_lib/batch-apply-engine.js";
import { generateOutreachDraft, type OutreachKind } from "./_lib/outreach-engine.js";
import {
  scheduleApplicationCadence,
  scheduleRecruiterCadence,
  generateContextualFollowup,
  dueFollowups,
  markFollowupSent,
} from "./_lib/followup-engine.js";
import { syncInboxForUser, classifyMessage } from "./_lib/inbox-intelligence.js";
import {
  launchAuthenticatedContext,
  resolveStorageState,
  listBrowserProfiles,
  deleteBrowserProfile,
  saveCapturedStorageState,
  type BrowserProviderName,
} from "./_lib/playwright-platform.js";
import { enqueue, queueStats, QUEUE_NAMES } from "./_lib/queue.js";
import {
  registerConsumer,
  listConsumers,
  replayEvent,
  deliveryHistory,
  type ConsumerType,
} from "./_lib/event-bus.js";
import { getProvider, PROVIDER_REGISTRY, isKnownProvider } from "./_lib/providers.js";
import { supabaseAdmin } from "./_lib/supabase.js";
import { emitWorkflowEvent } from "./_lib/workflow-events.js";
import { verifyAndStoreEmailsForRecruiters } from "./_lib/email-discovery.js";
import { validatePrerequisites } from "./_lib/workflow-runner.js";
import { runWorkflowPrecheck } from "./_lib/workflow-precheck.js";

// ───────────────────────────── A1 — Provider Audit ─────────────────────────

export async function handleProviderAudit(request: Request) {
  const user = await requireApiUser(request);
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const audit = PROVIDER_REGISTRY.map((name) => {
    const provider = getProvider(name);
    // Pull the user's saved integration config if present.
    return {
      provider: name,
      authMethod: provider.authMethod,
      capabilities: provider.capabilities,
      jobsSupported: provider.capabilities.jobsSupported,
      recruitersSupported: provider.capabilities.recruitersSupported,
      applicationsSupported: provider.capabilities.applicationsSupported,
      implemented: true,
      // Evidence (code locations) — these files exist in the repo.
      evidence: {
        jobSource: name === "workable" ? "api/_lib/workable-source.ts" : "api/_lib/job-sources.ts",
        providerClass: `api/_lib/providers.ts -> ${name[0].toUpperCase()}${name.slice(1)}Provider`,
        registry: "api/_lib/providers.ts -> PROVIDER_REGISTRY",
      },
    };
  });

  // Mark which providers have credentials configured for this user.
  const { data: integrations } = await supabaseAdmin
    .from("integrations")
    .select("provider,enabled,config")
    .eq("user_id", user.id)
    .in("provider", [...PROVIDER_REGISTRY]);
  const byProvider = new Map((integrations ?? []).map((row: any) => [row.provider, row]));

  return json({
    providers: audit.map((entry) => {
      const integration = byProvider.get(entry.provider) as any;
      const hasConfig =
        !!integration?.config &&
        Object.values(integration.config).some((v) => typeof v === "string" && v.trim());
      return {
        ...entry,
        configured: !!integration?.enabled && hasConfig,
        status: !entry.capabilities.jobsSupported
          ? "jobs_not_supported"
          : integration?.enabled && hasConfig
            ? "ready"
            : "ready_for_credentials",
      };
    }),
    coverage: {
      total: PROVIDER_REGISTRY.length,
      jobsImported: audit.filter((a) => a.capabilities.jobsSupported).length,
      recruitersImported: audit.filter((a) => a.capabilities.recruitersSupported).length,
      applicationsSupported: audit.filter((a) => a.capabilities.applicationsSupported).length,
    },
  });
}

// ───────────────────────────── A4 — Match Engine ───────────────────────────

export async function handleMatchScore(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ jobId: string }>(request);

  const [jobRow, brainRow] = await Promise.all([
    supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("id", body.jobId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const job: any = jobRow.data ?? null;
  const brain: any = brainRow.data ?? {};
  if (!job) return json({ error: "Job not found." }, { status: 404 });

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
  });

  await supabaseAdmin
    .from("jobs")
    .update({ match_score: breakdown.score } as any)
    .eq("id", body.jobId)
    .eq("user_id", user.id);

  return json({ jobId: body.jobId, ...breakdown });
}

// ───────────────────────────── A5 — High Value Engine ──────────────────────

export async function handleStrategicValue(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ companyName: string }>(request);

  const [researchRow, jobsRow, recruitersRow, companyRow] = await Promise.all([
    supabaseAdmin
      .from("company_research")
      .select("*")
      .eq("user_id", user.id)
      .eq("company_name", body.companyName)
      .maybeSingle(),
    supabaseAdmin
      .from("jobs")
      .select("id,title")
      .eq("user_id", user.id)
      .eq("company_name", body.companyName),
    supabaseAdmin
      .from("recruiters")
      .select("id")
      .eq("user_id", user.id)
      .ilike("company", body.companyName),
    supabaseAdmin
      .from("companies")
      .select("*")
      .eq("user_id", user.id)
      .ilike("name", body.companyName)
      .maybeSingle(),
  ]);

  const research: any = researchRow.data ?? {};
  const companyRowData: any = companyRow.data ?? {};

  // Reconstruct the strategic-value inputs from stored research metadata.
  const intelligence: Record<string, unknown> = research.file_url
    ? safeParse(research.file_url)
    : {};
  const result = computeStrategicValue({
    hiringSignals: (intelligence.hiringSignals as string[]) ?? [],
    fundingData: (intelligence.fundingData as Record<string, unknown>) ?? null,
    growthSignals: companyRowData.growth_signals ?? null,
    openJobCount: (jobsRow.data ?? []).length,
    recruiterDensity: (recruitersRow.data ?? []).length,
    techStack: research.tech_stack ?? companyRowData.tech_stack ?? [],
    recentNews: research.recent_news ?? companyRowData.recent_news,
    companyResearch: { summary: research.summary },
    painPoints: await loadPainPoints(user.id, body.companyName),
    companyQualityScore: companyRowData.company_quality_score,
  });

  // Persist the score + tier back on the company row.
  const payload = {
    user_id: user.id,
    name: body.companyName,
    strategic_value_score: result.strategicValueScore,
    value_tier: result.valueTier,
    target_value: result.valueTier === "HIGH" ? "high" : (companyRowData.target_value ?? "normal"),
    company_quality_score: companyRowData.company_quality_score ?? result.breakdown.companyQuality,
    open_job_count: (jobsRow.data ?? []).length,
    recruiter_density: (recruitersRow.data ?? []).length,
    growth_signals: companyRowData.growth_signals ?? {},
    funding_data: intelligence.fundingData ?? {},
    tech_stack: research.tech_stack ?? [],
    recent_news: research.recent_news ?? null,
    assessed_at: new Date().toISOString(),
  } as any;

  if (companyRowData.id) {
    await supabaseAdmin.from("companies").update(payload).eq("id", companyRowData.id);
  } else {
    await supabaseAdmin.from("companies").insert(payload);
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "strategic_value_computed",
    entityType: "companies",
    payload: {
      companyName: body.companyName,
      score: result.strategicValueScore,
      tier: result.valueTier,
    },
  });

  return json({ companyName: body.companyName, ...result });
}

async function loadPainPoints(userId: string, companyName: string) {
  const { data } = await supabaseAdmin
    .from("painpoints")
    .select("severity")
    .eq("user_id", userId)
    .eq("company_name", companyName);
  return (data ?? []) as Array<{ severity?: number | null }>;
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    logger.warn("[PhaseHandlers] safeParse JSON parse failed", err);
    return {};
  }
}

// ───────────────────────────── A6 — Recruiter Discovery v2 ─────────────────

export async function handleRecruiterDiscoveryV2(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ companyName: string; roleTitle?: string }>(request);

  const [researchRow, existingRow] = await Promise.all([
    supabaseAdmin
      .from("company_research")
      .select("*")
      .eq("user_id", user.id)
      .eq("company_name", body.companyName)
      .maybeSingle(),
    supabaseAdmin
      .from("recruiters")
      .select("*")
      .eq("user_id", user.id)
      .ilike("company", body.companyName),
  ]);

  let contacts: any[] = [];
  try {
    contacts = await discoverContactsViaAI({
      userId: user.id,
      companyName: body.companyName,
      roleTitle: body.roleTitle ?? "Software Engineer",
      context: { research: researchRow.data, existingContacts: existingRow.data ?? [] },
    });
    if (!contacts.length) contacts = [];
  } catch (err) {
    logger.warn("[PhaseHandlers] handleRecruiterDiscoveryV2 AI discovery failed", err);
    contacts = [];
  }

  const inserted: any[] = [];
  for (const c of contacts) {
    const dup = await supabaseAdmin
      .from("recruiters")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", c.name)
      .maybeSingle();
    const payload = {
      user_id: user.id,
      name: c.name,
      company: body.companyName,
      title: c.title,
      role: c.role,
      profile_url: c.profile_url,
      linkedin_url: c.linkedin_url,
      email: c.email,
      email_verified: c.email_verified,
      source: c.source,
      discovered_via: "discovery_v2",
      confidence_score: c.confidence_score,
      relevance_score: c.confidence_score,
      notes: `${c.title}\n\n${c.reason}\n\nSearch: ${c.searchQuery}`,
    };
    let row;
    if (dup.data?.id) {
      const upd = await supabaseAdmin
        .from("recruiters")
        .update(payload)
        .eq("id", dup.data.id)
        .select("*")
        .single();
      row = upd.data;
    } else {
      const ins = await supabaseAdmin
        .from("recruiters")
        .insert(payload as any)
        .select("*")
        .single();
      row = ins.data;
    }
    if (row) inserted.push(row);
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "recruiter_discovery_completed",
    entityType: "recruiters",
    payload: { companyName: body.companyName, count: inserted.length },
  });

  return json({ companyName: body.companyName, recruiters: inserted });
}

// ───────────────────────────── A7 — Apply Engine ───────────────────────────

export async function handleApply(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ jobId: string; companyName: string; roleTitle?: string }>(request);

  const resume = await resolvePrimaryResume(user.id);
  if (!resume) return json({ error: "Upload a primary resume first." }, { status: 400 });

  // Create the application row (saved → applied on submit success).
  const appInsert = await supabaseAdmin
    .from("applications")
    .insert({
      user_id: user.id,
      job_id: body.jobId,
      company_name: body.companyName,
      role_title: body.roleTitle ?? "Role",
      status: "saved",
      source: "apply_engine",
      primary_resume_id: resume.resumeId,
    } as any)
    .select("*")
    .single();
  if (appInsert.error) { logger.warn("[phase] app insert failed", appInsert.error); return json({ error: "Insert failed" }, { status: 400 }); }
  const applicationId = appInsert.data.id;

  await buildApplicationPackage({
    userId: user.id,
    jobId: body.jobId,
    applicationId,
    companyName: body.companyName,
  });
  const result = await submitApplication({ userId: user.id, applicationId, jobId: body.jobId });

  await scheduleApplicationCadence({
    userId: user.id,
    applicationId,
    companyName: body.companyName,
  });

  return json(result);
}

// ───────────────────────────── A8 — Batch Apply ────────────────────────────

export async function handleBatchApply(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{
    strategy: BatchStrategy;
    filters?: Record<string, unknown>;
    approvalMode?: boolean;
    execute?: string; // batch id to execute after approval
  }>(request);

  if (body.execute) {
    // Execute a previously-queued (approval-mode) batch.
    const run = await supabaseAdmin
      .from("batch_apply_runs")
      .select("*")
      .eq("id", body.execute)
      .eq("user_id", user.id)
      .single();
    if (run.error || !run.data) return json({ error: "Batch not found." }, { status: 404 });
    const items = await supabaseAdmin
      .from("batch_apply_items")
      .select("job_id")
      .eq("batch_id", body.execute)
      .eq("user_id", user.id);
    const jobIds = (items.data ?? []).map((r: any) => r.job_id);
    const jobs = await supabaseAdmin
      .from("jobs")
      .select("id,title,company_name,url")
      .in("id", jobIds)
      .eq("user_id", user.id);
    const { executeBatch } = await import("./_lib/batch-apply-engine.js");
    const result = await executeBatch(
      user.id,
      body.execute,
      (run.data as any).strategy,
      (jobs.data ?? []).map((j: any) => ({
        id: j.id,
        title: j.title,
        company_name: j.company_name,
        url: j.url,
        tier: "B",
      })),
    );
    return json(result);
  }

  const result = await runBatchApply({
    userId: user.id,
    strategy: body.strategy ?? "balanced",
    filters: body.filters as any,
    approvalMode: body.approvalMode,
  });
  return json(result);
}

export async function handleBatchEligibility(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ strategy: BatchStrategy; filters?: Record<string, unknown> }>(
    request,
  );
  const eligible = await resolveEligibleJobs(
    user.id,
    body.strategy ?? "balanced",
    (body.filters as any) ?? {},
  );
  return json({
    strategy: body.strategy,
    eligible: eligible.length,
    jobs: eligible,
    config: STRATEGY_CONFIG[body.strategy ?? "balanced"],
  });
}

// ───────────────────────────── A9 — Outreach Engine v2 ─────────────────────

export async function handleOutreachV2(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{
    kind: OutreachKind;
    companyName: string;
    recruiterId?: string;
    resumeId?: string;
    painPointIds?: string[];
  }>(request);

  const resumeId = body.resumeId ?? (await resolvePrimaryResume(user.id))?.resumeId;
  if (!resumeId) return json({ error: "Upload a primary resume first." }, { status: 400 });

  const draft = await generateOutreachDraft({
    userId: user.id,
    kind: body.kind,
    companyName: body.companyName,
    recruiterId: body.recruiterId,
    resumeId,
    painPointIds: body.painPointIds,
  });
  return json(draft);
}

// ───────────────────────────── A10 — Followup Engine ───────────────────────

export async function handleFollowupSchedule(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{
    applicationId?: string;
    recruiterId?: string;
    companyName: string;
  }>(request);
  let result;
  if (body.applicationId) {
    result = await scheduleApplicationCadence({
      userId: user.id,
      applicationId: body.applicationId,
      companyName: body.companyName,
    });
  } else if (body.recruiterId) {
    result = await scheduleRecruiterCadence({
      userId: user.id,
      recruiterId: body.recruiterId,
      companyName: body.companyName,
    });
  } else {
    return json({ error: "applicationId or recruiterId required." }, { status: 400 });
  }
  return json(result);
}

export async function handleFollowupGenerate(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ followupId: string }>(request);
  const draft = await generateContextualFollowup({ userId: user.id, followupId: body.followupId });
  return json(draft);
}

export async function handleFollowupDue(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  return json(await dueFollowups(user.id, 100));
}

export async function handleFollowupMarkSent(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ followupId: string }>(request);
  return json(await markFollowupSent(user.id, body.followupId));
}

// ───────────────────────────── A11 — Inbox Intelligence ────────────────────

export async function handleInboxSync(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ maxResults?: number }>(request).catch(
    () => ({}) as { maxResults?: number },
  );
  const result = await syncInboxForUser(user.id, body.maxResults ?? 25);
  return json(result);
}

export async function handleInboxClassify(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  await requireApiUser(request);
  const body = await readJson<{ subject: string; body: string; fromAddress: string }>(request);
  return json(classifyMessage(body));
}

export async function handleInboxList(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const url = new URL(request.url);
  const classification = url.searchParams.get("classification");
  let q = supabaseAdmin
    .from("inbox_messages")
    .select("*")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .limit(100);
  if (classification) q = q.eq("classification", classification);
  const { data, error } = await q;
  if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });
  return json(data ?? []);
}

// ───────────────────────────── B1 — Playwright Platform ────────────────────

export async function handleBrowserProfiles(request: Request) {
  const user = await requireApiUser(request);
  if (request.method === "GET") return json(await listBrowserProfiles(user.id));
  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider") as BrowserProviderName | null;
    if (!provider) return json({ error: "provider required" }, { status: 400 });
    return json(await deleteBrowserProfile(user.id, provider));
  }
  return methodNotAllowed(["GET", "DELETE"]);
}

export async function handleBrowserSession(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ provider: BrowserProviderName }>(request);
  const result = await launchAuthenticatedContext(user.id, body.provider);
  return json(result);
}

export async function handleBrowserStorageState(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") as BrowserProviderName | null;
  if (!provider) return json({ error: "provider required" }, { status: 400 });
  return json(await resolveStorageState(user.id, provider));
}

export async function handleBrowserCapture(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ provider: BrowserProviderName; storageState: any }>(request);
  return json(await saveCapturedStorageState(user.id, body.provider, body.storageState));
}

// ───────────────────────────── B2/B3 — Queues ──────────────────────────────

export async function handleQueueEnqueue(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{
    queue: (typeof QUEUE_NAMES)[number];
    jobName: string;
    data: Record<string, unknown>;
    delayMs?: number;
  }>(request);
  if (!QUEUE_NAMES.includes(body.queue)) return json({ error: "Invalid queue." }, { status: 400 });
  const result = await enqueue(body.queue, body.jobName, body.data, {
    userId: user.id,
    delayMs: body.delayMs,
  });
  return json(result);
}

export async function handleQueueStats(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  return json(await queueStats(user.id));
}

// ───────────────────────────── B4 — Event Bus ──────────────────────────────

export async function handleEventBusConsumers(request: Request) {
  const user = await requireApiUser(request);
  if (request.method === "GET") return json(await listConsumers(user.id));
  if (request.method === "POST") {
    const body = await readJson<{
      name: string;
      type: ConsumerType;
      target: string;
      eventTypes?: string[];
      secret?: string;
    }>(request);
    return json(
      await registerConsumer(user.id, {
        name: body.name,
        type: body.type,
        target: body.target,
        eventTypes: body.eventTypes ?? [],
        secret: body.secret,
      }),
    );
  }
  return methodNotAllowed(["GET", "POST"]);
}

export async function handleEventBusReplay(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ eventId: string }>(request);
  return json(await replayEvent(user.id, body.eventId));
}

export async function handleEventBusHistory(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) return json({ error: "eventId required" }, { status: 400 });
  return json(await deliveryHistory(user.id, eventId));
}

// ───────────────────────────── Job Import (workable support) ────────────────

export async function handleProviderImport(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ sources: any[] }>(request).catch(() => null);
  if (!body || !Array.isArray(body.sources)) {
    return json({ error: "body.sources is required and must be an array." }, { status: 400 });
  }
  // Reuse the existing handler logic via internal request.
  // Delegate to the main router's jobs/import by re-importing the resolver.
  const { resolveSourceJobs } = await import("./_lib/job-resolver.js");
  let importedCount = 0;
  const imported: any[] = [];
  for (const source of body.sources) {
    if (!isKnownProvider(String(source.source))) {
      return json({ error: `Unknown provider: ${source.source}` }, { status: 400 });
    }
    const jobs = await resolveSourceJobs(user.id, source);
    for (const job of jobs) {
      const upsert = await supabaseAdmin
        .from("jobs")
        .upsert(
          {
            user_id: user.id,
            title: job.title,
            company_name: job.companyName,
            location: job.location,
            url: job.url,
            source: job.source,
            source_type: job.source,
            source_url: job.url,
            provider: job.source,
            description: job.description,
            posted_at: job.postedAt,
            external_id: job.externalId,
            raw_payload: job.rawPayload,
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
    await emitWorkflowEvent({
      userId: user.id,
      eventType: "jobs_imported",
      entityType: "job_import_runs",
      payload: { source: source.source, importedCount: jobs.length },
    });
  }
  return json({ importedCount, jobs: imported });
}

// ───────────────────────────── P3 — Recruiter Discovery V3 ─────────────────

export async function handleRecruiterDiscoveryV3(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{
    companyName: string;
    companyUrl?: string;
    companyDomain?: string;
    roleTitle?: string;
  }>(request);

  const contacts = await discoverContactsV3({
    companyName: body.companyName,
    companyUrl: body.companyUrl,
    companyDomain: body.companyDomain,
    roleTitle: body.roleTitle ?? "Software Engineer",
    userId: user.id,
  });

  const inserted: any[] = [];
  for (const c of contacts) {
    const dup = await supabaseAdmin
      .from("recruiters")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", c.name)
      .maybeSingle();
    const payload = {
      user_id: user.id,
      name: c.name,
      company: body.companyName,
      title: c.title,
      role: c.role,
      department: c.department ?? null,
      profile_url: c.profile_url,
      linkedin_url: c.linkedin_url,
      email: c.email,
      email_verified: c.email_verified,
      source: c.source,
      source_url: c.source_url ?? null,
      source_metadata: c.source_metadata ?? {},
      discovered_via: "discovery_v3",
      confidence_score: c.confidence_score,
      relevance_score: c.confidence_score,
      discovered_at: new Date().toISOString(),
      notes: `${c.reason}\n\nSearch: ${c.searchQuery}`,
    };
    let row;
    if (dup.data?.id) {
      const upd = await supabaseAdmin
        .from("recruiters")
        .update(payload)
        .eq("id", dup.data.id)
        .select("*")
        .single();
      row = upd.data;
    } else {
      const ins = await supabaseAdmin
        .from("recruiters")
        .insert(payload as any)
        .select("*")
        .single();
      row = ins.data;
    }
    if (row) inserted.push(row);
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "recruiter_discovery_completed",
    entityType: "recruiters",
    payload: { companyName: body.companyName, count: inserted.length, version: "v3" },
  });

  return json({
    companyName: body.companyName,
    recruiters: inserted,
    totalSources: Object.keys(contacts).length,
  });
}

// ───────────────────────────── P4 — Email Discovery ────────────────────────

export async function handleEmailDiscovery(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ companyName?: string; recruiterIds?: string[] }>(request);

  let recruiters: any[];
  if (body.recruiterIds?.length) {
    const { data } = await supabaseAdmin
      .from("recruiters")
      .select("*")
      .in("id", body.recruiterIds)
      .eq("user_id", user.id);
    recruiters = data ?? [];
  } else {
    const q = supabaseAdmin.from("recruiters").select("*").eq("user_id", user.id);
    if (body.companyName) q.ilike("company", body.companyName);
    const { data } = await q.limit(50);
    recruiters = data ?? [];
  }

  const results = await verifyAndStoreEmailsForRecruiters(user.id, recruiters);

  return json({
    total: results.length,
    verified: results.filter((r) => r.confidence === "VERIFIED").length,
    likely: results.filter((r) => r.confidence === "LIKELY").length,
    unknown: results.filter((r) => r.confidence === "UNKNOWN").length,
    results,
  });
}

// ───────────────────────────── P5 — High Value Engine V3 ───────────────────

export async function handleHighValueV3(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ companyName: string; useAI?: boolean }>(request);

  const [researchRow, jobsRow, recruitersRow, companyRow] = await Promise.all([
    supabaseAdmin
      .from("company_research")
      .select("*")
      .eq("user_id", user.id)
      .eq("company_name", body.companyName)
      .maybeSingle(),
    supabaseAdmin
      .from("jobs")
      .select("id,title")
      .eq("user_id", user.id)
      .eq("company_name", body.companyName),
    supabaseAdmin
      .from("recruiters")
      .select("id")
      .eq("user_id", user.id)
      .ilike("company", body.companyName),
    supabaseAdmin
      .from("companies")
      .select("*")
      .eq("user_id", user.id)
      .ilike("name", body.companyName)
      .maybeSingle(),
  ]);

  const research: any = researchRow.data ?? {};
  const companyRowData: any = companyRow.data ?? {};
  const intelligence: Record<string, unknown> = research.file_url
    ? safeParse(research.file_url)
    : {};

  const inputs = {
    hiringSignals: (intelligence.hiringSignals as string[]) ?? [],
    fundingData: (intelligence.fundingData as Record<string, unknown>) ?? null,
    growthSignals: companyRowData.growth_signals ?? null,
    openJobCount: (jobsRow.data ?? []).length,
    recruiterDensity: (recruitersRow.data ?? []).length,
    techStack: research.tech_stack ?? companyRowData.tech_stack ?? [],
    recentNews: research.recent_news ?? companyRowData.recent_news,
    companyResearch: { summary: research.summary },
    painPoints: await loadPainPoints(user.id, body.companyName),
    companyQualityScore: companyRowData.company_quality_score,
    hiringVelocity: companyRowData.hiring_velocity,
    engineeringMaturity: companyRowData.engineering_maturity_score,
    remoteFriendliness: companyRowData.remote_friendliness,
    productMomentum: companyRowData.product_momentum_score,
  };

  const result = body.useAI
    ? await computeStrategicValueWithAI(inputs, body.companyName, user.id)
    : computeStrategicValue(inputs);

  const payload = {
    user_id: user.id,
    name: body.companyName,
    strategic_value_score: result.strategicValueScore,
    value_tier: result.valueTier,
    company_quality_score: result.companyQualityScore,
    priority_score: result.priorityScore,
    priority_tier: result.priorityTier,
    target_value:
      result.valueTier === "HIGH" || result.valueTier === "ELITE"
        ? "high"
        : (companyRowData.target_value ?? "normal"),
    open_job_count: (jobsRow.data ?? []).length,
    recruiter_density: (recruitersRow.data ?? []).length,
    growth_signals: companyRowData.growth_signals ?? {},
    funding_data: intelligence.fundingData ?? {},
    tech_stack: research.tech_stack ?? [],
    recent_news: research.recent_news ?? null,
    ai_score_breakdown: result.breakdown as any,
    ai_assessed_at: body.useAI ? new Date().toISOString() : null,
    assessed_at: new Date().toISOString(),
  } as any;

  if (companyRowData.id) {
    await supabaseAdmin.from("companies").update(payload).eq("id", companyRowData.id);
  } else {
    await supabaseAdmin.from("companies").insert(payload);
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "strategic_value_computed",
    entityType: "companies",
    payload: {
      companyName: body.companyName,
      score: result.strategicValueScore,
      tier: result.valueTier,
      priorityTier: result.priorityTier,
    },
  });

  return json({ companyName: body.companyName, ...result });
}

// ───────────────────────────── Playwright Apply Evidence ───────────────────

export async function handlePlaywrightEvidence(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const { getApplyEvidence } = await import("./_lib/playwright-apply.js");
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");
  if (!applicationId) return json({ error: "applicationId required" }, { status: 400 });
  return json(await getApplyEvidence(applicationId, user.id));
}

// ───────────────────────────── Workflow Precheck ─────────────────────────

export async function handleWorkflowPrecheck(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const result = await runWorkflowPrecheck(user.id);
  return json(result);
}

// ───────────────────────────── Workflow Validate ──────────────────────────

export async function handleWorkflowValidate(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const result = await validatePrerequisites(user.id);
  return json(result);
}

// ───────────────────────────── P8 — Approval Status ────────────────────────

export async function handleApprovalStatus(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending";

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(
      "id, job_id, company_name, role_title, status, approval_status, created_at, approval_requested_at",
    )
    .eq("user_id", user.id)
    .eq("approval_status", status)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });
  return json({ approvals: data ?? [] });
}
