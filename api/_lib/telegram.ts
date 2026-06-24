import { supabaseAdmin } from "./supabase.js";
import { emitWorkflowEvent } from "./workflow-events.js";
import { applyWithPlaywright, recordPlaywrightApplyResult } from "./playwright-apply.js";
import { submitApprovedApplication, resolvePrimaryResume } from "./apply-engine.js";
import {
  ProviderName,
  PROVIDERS,
  getProviderControls,
  getProviderControl,
  setProviderStatus,
  isProviderEnabled,
  recordProviderSuccess,
  recordProviderFailure,
  getHealthLog,
} from "./provider-controls.js";
import { sendAlert, alertProviderDisabled, alertProviderEnabled } from "./alerting.js";

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    from?: { id: number; first_name?: string; username?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { chat: { id: number }; message_id?: number };
    data?: string;
  };
};

type InlineButton = {
  text: string;
  callback_data: string;
};

type InlineKeyboard = InlineButton[][];

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${getToken()}/${method}`;
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: Number(chatId), text, parse_mode: "HTML" }),
    });
    const body = await res.json();
    return { ok: body.ok ?? false, error: body.description };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function sendTelegramKeyboard(
  chatId: string | number,
  text: string,
  buttons: InlineKeyboard,
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  try {
    const res = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(chatId),
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons },
      }),
    });
    const body = await res.json();
    return { ok: body.ok ?? false, error: body.description, messageId: body.result?.message_id };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function editTelegramKeyboard(
  chatId: string | number,
  messageId: number,
  text: string,
  buttons?: InlineKeyboard,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body: any = { chat_id: Number(chatId), message_id: messageId, text, parse_mode: "HTML" };
    if (buttons) body.reply_markup = { inline_keyboard: buttons };
    const res = await fetch(apiUrl("editMessageText"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { ok: json.ok ?? false, error: json.description };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  try {
    await fetch(apiUrl("answerCallbackQuery"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch {
    /* noop */
  }
}

async function resolveDefaultChatId(): Promise<string> {
  return process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
}

async function queryRecentJobs(userId: string, limit = 5) {
  const { data } = await supabaseAdmin
    .from("jobs")
    .select("id,title,company_name,source,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function queryRecentApplications(userId: string, limit = 5) {
  const { data } = await supabaseAdmin
    .from("applications")
    .select("id,job_id,company_name,role_title,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function queryRecruiters(userId: string, limit = 5) {
  const { data } = await supabaseAdmin
    .from("recruiters")
    .select("id,name,company,title,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function queryInterviews(userId: string, limit = 5) {
  const { data } = await supabaseAdmin
    .from("inbox_messages")
    .select("id,subject,snippet,received_at")
    .eq("user_id", userId)
    .eq("classification", "interview")
    .order("received_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function queryAnalytics(userId: string) {
  const [jobs, apps, interviews, assessments, offers] = await Promise.all([
    supabaseAdmin.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabaseAdmin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabaseAdmin
      .from("gmail_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("classification", "interview"),
    supabaseAdmin
      .from("gmail_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("classification", "assessment"),
    supabaseAdmin
      .from("gmail_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("classification", "offer"),
  ]);
  return {
    totalJobs: jobs.count ?? 0,
    totalApplications: apps.count ?? 0,
    totalInterviews: interviews.count ?? 0,
    totalAssessments: assessments.count ?? 0,
    totalOffers: offers.count ?? 0,
  };
}

async function queryPendingApprovals(userId: string, limit = 10) {
  const [apps, batchItems] = await Promise.all([
    supabaseAdmin
      .from("applications")
      .select("id,job_id,company_name,role_title,status,created_at,approval_status")
      .eq("user_id", userId)
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("batch_apply_items")
      .select("id,batch_id,job_id,status")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  return { applications: apps.data ?? [], batchItems: batchItems.data ?? [] };
}

async function queryHighValueCompanies(userId: string, limit = 10) {
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id,name,strategic_value_score,priority_tier,value_tier,assessed_at")
    .eq("user_id", userId)
    .order("strategic_value_score", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function queryDueFollowups(userId: string, limit = 10) {
  const { data } = await supabaseAdmin
    .from("followups")
    .select("id,due_at,done,note,application_id")
    .eq("user_id", userId)
    .eq("done", false)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);
  return data ?? [];
}

function formatJobsList(jobs: any[]): string {
  if (!jobs.length) return "No jobs found.";
  return jobs
    .map(
      (j) =>
        `• <b>${escapeHtml(j.title || j.title || "")}</b> @ ${escapeHtml(j.company_name || "")} [${j.source}]`,
    )
    .join("\n");
}

function formatApplicationsList(apps: any[]): string {
  if (!apps.length) return "No applications found.";
  return apps
    .map(
      (a) =>
        `• <b>${escapeHtml(a.role_title || "")}</b> @ ${escapeHtml(a.company_name || "")} — <i>${a.status}</i>`,
    )
    .join("\n");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseCommand(text: string): { command: string; args: string } {
  const parts = text.trim().split(/\s+/);
  return { command: parts[0]?.toLowerCase() ?? "", args: parts.slice(1).join(" ") };
}

async function handleHealthCommand(chatId: number): Promise<string> {
  const start = Date.now();
  const { data, error } = await supabaseAdmin.from("provider_controls").select("provider").limit(1);
  const dbMs = Date.now() - start;
  const dbOk = !error;
  return (
    `<b>🤖 VALTREXA-V2 — Health Check</b>\n` +
    `• Database: ${dbOk ? "✅ Connected" : "❌ Error"} (${dbMs}ms)\n` +
    `• Bot: ✅ Online\n` +
    `• Uptime: ${Math.floor(process.uptime())}s`
  );
}

async function handleStatusCommand(chatId: number, userId: string): Promise<string> {
  const analytics = await queryAnalytics(userId);
  return (
    `<b>📊 VALTREXA-V2 — Status</b>\n` +
    `• Jobs Imported: ${analytics.totalJobs}\n` +
    `• Applications: ${analytics.totalApplications}\n` +
    `• Interviews Detected: ${analytics.totalInterviews}\n` +
    `• Assessments Detected: ${analytics.totalAssessments}\n` +
    `• Offers Detected: ${analytics.totalOffers}`
  );
}

async function handleJobsCommand(chatId: number, userId: string): Promise<string> {
  const jobs = await queryRecentJobs(userId, 10);
  return `<b>💼 Recent Job Imports</b>\n` + formatJobsList(jobs);
}

async function handleApplicationsCommand(chatId: number, userId: string): Promise<string> {
  const apps = await queryRecentApplications(userId, 10);
  return `<b>📋 Recent Applications</b>\n` + formatApplicationsList(apps);
}

async function handleRecruitersCommand(chatId: number, userId: string): Promise<string> {
  const recruiters = await queryRecruiters(userId, 10);
  if (!recruiters.length) return "No recruiters discovered yet.";
  return (
    `<b>👥 Discovered Recruiters</b>\n` +
    recruiters
      .map(
        (r) => `• <b>${escapeHtml(r.name)}</b> — ${escapeHtml(r.title)} @ ${escapeHtml(r.company)}`,
      )
      .join("\n")
  );
}

async function handleInterviewsCommand(chatId: number, userId: string): Promise<string> {
  const interviews = await queryInterviews(userId, 10);
  if (!interviews.length) return "No interviews detected.";
  return (
    `<b>🎯 Detected Interviews</b>\n` +
    interviews
      .map(
        (i) =>
          `• <b>${escapeHtml(i.subject)}</b>\n  ${escapeHtml((i.snippet ?? "").slice(0, 100))}`,
      )
      .join("\n\n")
  );
}

async function handleAnalyticsCommand(chatId: number, userId: string): Promise<string> {
  const analytics = await queryAnalytics(userId);
  return (
    `<b>📈 Analytics Summary</b>\n` +
    `• Total Jobs: ${analytics.totalJobs}\n` +
    `• Total Applications: ${analytics.totalApplications}\n` +
    `• Interviews: ${analytics.totalInterviews}\n` +
    `• Assessments: ${analytics.totalAssessments}\n` +
    `• Offers: ${analytics.totalOffers}\n\n` +
    `<i>Last updated: ${new Date().toLocaleString()}</i>`
  );
}

async function handleApprovalsCommand(chatId: number, userId: string): Promise<string> {
  const { applications, batchItems } = await queryPendingApprovals(userId);
  let text = `<b>⏳ Pending Approvals</b>\n\n`;
  if (!applications.length && !batchItems.length) {
    text += "No pending approvals.";
    return text;
  }
  if (applications.length) {
    text += `<b>Applications (${applications.length}):</b>\n`;
    text += applications
      .map(
        (a: any) =>
          `• <b>${escapeHtml(a.role_title || "")}</b> @ ${escapeHtml(a.company_name || "")}`,
      )
      .join("\n");
    text += "\n\n";
  }
  if (batchItems.length) {
    text += `<b>Batch Items (${batchItems.length}):</b>\n`;
    text += batchItems.map((b: any) => `• Batch item ${b.id?.slice(0, 8)}...`).join("\n");
  }
  return text;
}

async function handleHighValueCommand(chatId: number, userId: string): Promise<string> {
  const companies = await queryHighValueCompanies(userId);
  if (!companies.length) return "No high-value companies assessed yet.";
  let text = `<b>🏆 High Value Companies</b>\n\n`;
  for (const c of companies) {
    const tier = c.priority_tier || c.value_tier || "unknown";
    const tierIcon =
      tier === "ELITE" ? "👑" : tier === "HIGH" ? "🔥" : tier === "MEDIUM" ? "⭐" : "📌";
    text += `${tierIcon} <b>${escapeHtml(c.name)}</b> — Score: ${c.strategic_value_score || "N/A"} (${tier})\n`;
  }
  return text;
}

async function handleFollowupsCommand(chatId: number, userId: string): Promise<string> {
  const followups = await queryDueFollowups(userId);
  if (!followups.length) return "No pending followups.";
  let text = `<b>⏰ Due Followups</b>\n\n`;
  for (const f of followups) {
    const dueDate = new Date(f.due_at).toLocaleDateString();
    text += `• ${escapeHtml(f.note || "Followup")} — due: ${dueDate}\n`;
  }
  return text;
}

// ─── Provider Command Handlers ──────────────────────────────

async function handleProviderStatusCommand(chatId: number): Promise<string> {
  try {
    const controls = await getProviderControls();
    let text = "<b>🔧 Provider Status</b>\n\n";
    for (const c of controls) {
      const emoji =
        c.status === "enabled"
          ? "✅"
          : c.status === "disabled"
            ? "❌"
            : c.status === "paused"
              ? "⏸️"
              : "🔧";
      text += `${emoji} <b>${c.provider}</b>: ${c.status}`;
      if (c.consecutive_failures > 0) text += ` | ${c.consecutive_failures} consecutive failures`;
      if (c.last_failure_at) {
        const ago = Math.round((Date.now() - new Date(c.last_failure_at).getTime()) / 60000);
        text += `\n  Last failure: ${ago}m ago`;
      }
      if (c.last_failure_reason) text += `\n  Reason: ${c.last_failure_reason}`;
      text += "\n";
    }
    return text;
  } catch (err: any) {
    return `Failed to get provider status: ${escapeHtml(err.message)}`;
  }
}

async function handleProviderEnableCommand(chatId: number, provider: string): Promise<string> {
  const p = provider.toLowerCase() as ProviderName;
  if (!PROVIDERS.includes(p)) return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
  try {
    const control = await getProviderControl(p);
    if (!control) return `Provider "${p}" not found.`;
    if (control.status === "enabled") return `Provider "${p}" is already enabled.`;
    await setProviderStatus(p, "enabled", "telegram");
    await alertProviderEnabled(p);
    return `✅ Provider "${p}" has been enabled.`;
  } catch (err: any) {
    return `Failed to enable "${p}": ${escapeHtml(err.message)}`;
  }
}

async function handleProviderDisableCommand(chatId: number, provider: string): Promise<string> {
  const p = provider.toLowerCase() as ProviderName;
  if (!PROVIDERS.includes(p)) return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
  try {
    const control = await getProviderControl(p);
    if (!control) return `Provider "${p}" not found.`;
    if (control.status === "disabled") return `Provider "${p}" is already disabled.`;
    await setProviderStatus(p, "disabled", "telegram");
    await alertProviderDisabled(p, "Disabled via Telegram", false);
    return `❌ Provider "${p}" has been disabled.`;
  } catch (err: any) {
    return `Failed to disable "${p}": ${escapeHtml(err.message)}`;
  }
}

async function handleProviderPauseCommand(chatId: number, provider: string): Promise<string> {
  const p = provider.toLowerCase() as ProviderName;
  if (!PROVIDERS.includes(p)) return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
  try {
    await setProviderStatus(p, "paused", "telegram");
    return `⏸️ Provider "${p}" has been paused.`;
  } catch (err: any) {
    return `Failed to pause "${p}": ${escapeHtml(err.message)}`;
  }
}

async function handleProviderResumeCommand(chatId: number, provider: string): Promise<string> {
  const p = provider.toLowerCase() as ProviderName;
  if (!PROVIDERS.includes(p)) return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
  try {
    await setProviderStatus(p, "enabled", "telegram");
    return `▶️ Provider "${p}" has been resumed.`;
  } catch (err: any) {
    return `Failed to resume "${p}": ${escapeHtml(err.message)}`;
  }
}

async function handleProviderHistoryCommand(chatId: number, provider?: string): Promise<string> {
  try {
    const p = provider?.toLowerCase() as ProviderName | undefined;
    if (p && !PROVIDERS.includes(p))
      return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
    const logs = await getHealthLog(p, 10);
    if (logs.length === 0) return "No health events recorded.";
    let text = "<b>📋 Provider Health Log</b>\n\n";
    for (const log of logs) {
      const emoji = log.severity === "critical" ? "🚨" : log.severity === "warning" ? "⚠️" : "ℹ️";
      const date = new Date(log.created_at).toLocaleString();
      text += `${emoji} <b>${log.provider}</b> [${log.event_type}]\n`;
      text += `  ${log.message}\n`;
      text += `  <i>${date}</i>\n\n`;
    }
    return text;
  } catch (err: any) {
    return `Failed to get health log: ${escapeHtml(err.message)}`;
  }
}

export async function processTelegramUpdate(
  body: TelegramUpdate,
  userId: string,
): Promise<{ handled: boolean; response?: string }> {
  if (body.message?.text) {
    const chatId = body.message.chat.id;
    const { command, args } = parseCommand(body.message.text);

    let responseText: string;
    switch (command) {
      case "/health":
      case "/start":
        responseText = await handleHealthCommand(chatId);
        break;
      case "/status":
        responseText = await handleStatusCommand(chatId, userId);
        break;
      case "/jobs":
        responseText = await handleJobsCommand(chatId, userId);
        break;
      case "/applications":
        responseText = await handleApplicationsCommand(chatId, userId);
        break;
      case "/recruiters":
        responseText = await handleRecruitersCommand(chatId, userId);
        break;
      case "/interviews":
        responseText = await handleInterviewsCommand(chatId, userId);
        break;
      case "/analytics":
        responseText = await handleAnalyticsCommand(chatId, userId);
        break;
      case "/approvals":
        responseText = await handleApprovalsCommand(chatId, userId);
        break;
      case "/highvalue":
        responseText = await handleHighValueCommand(chatId, userId);
        break;
      case "/followups":
        responseText = await handleFollowupsCommand(chatId, userId);
        break;
      case "/provider-status":
        responseText = await handleProviderStatusCommand(chatId);
        break;
      case "/provider-history":
        responseText = await handleProviderHistoryCommand(chatId, args.trim() || undefined);
        break;
      case "/provider-enable":
        responseText = await handleProviderEnableCommand(chatId, args.trim());
        break;
      case "/provider-disable":
        responseText = await handleProviderDisableCommand(chatId, args.trim());
        break;
      case "/provider-pause":
        responseText = await handleProviderPauseCommand(chatId, args.trim());
        break;
      case "/provider-resume":
        responseText = await handleProviderResumeCommand(chatId, args.trim());
        break;
      default:
        return { handled: false };
    }

    await sendTelegramMessage(chatId, responseText);
    return { handled: true, response: responseText };
  }

  if (body.callback_query) {
    const { id: cbId, data, from, message } = body.callback_query;
    const chatId = message?.chat.id;
    if (data && chatId) {
      await handleCallbackQuery(cbId, data, chatId, userId, message?.message_id);
    }
    return { handled: true };
  }

  return { handled: false };
}

async function handleCallbackQuery(
  callbackQueryId: string,
  data: string,
  chatId: number,
  userId: string,
  messageId?: number,
): Promise<void> {
  const parts = data.split(":");
  const action = parts[0];
  const entityType = parts[1];
  const entityId = parts.slice(2).join(":");

  let responseText = "";
  switch (action) {
    case "approve":
      responseText = await approveEntity(entityType, entityId, userId, chatId, messageId);
      break;
    case "reject":
      responseText = await rejectEntity(entityType, entityId, userId, chatId, messageId);
      break;
    case "view":
      responseText = await viewEntity(entityType, entityId, userId);
      break;
    case "review":
      responseText = await viewAnswers(entityType, entityId, userId);
      break;
    default:
      responseText = `Unknown action: ${action}`;
  }

  await answerCallbackQuery(callbackQueryId, responseText);
  if (messageId) {
    await editTelegramKeyboard(chatId, messageId, responseText);
  } else {
    await sendTelegramMessage(chatId, responseText);
  }
}

async function approveEntity(
  entityType: string,
  entityId: string,
  userId: string,
  chatId: number,
  messageId?: number,
): Promise<string> {
  switch (entityType) {
    case "application": {
      const { data: app } = await supabaseAdmin
        .from("applications")
        .select("*, jobs!inner(url, company_name, id, source)")
        .eq("id", entityId)
        .eq("user_id", userId)
        .single();
      if (!app) return "❌ Application not found.";

      const provider = String(app.jobs?.source || "linkedin").toLowerCase();
      const jobUrl = app.jobs?.url || "";
      const companyName = app.jobs?.company_name || "Unknown";
      const jobId = app.jobs?.id;

      await supabaseAdmin
        .from("applications")
        .update({ approval_status: "approved", approval_responded_at: new Date().toISOString() })
        .eq("id", entityId);

      await emitWorkflowEvent({
        userId,
        eventType: "application_approved",
        entityType: "applications",
        entityId,
        payload: { approvedAt: new Date().toISOString() },
      });

      const [resume, brain] = await Promise.all([
        resolvePrimaryResume(userId),
        supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      const pwResult = await applyWithPlaywright({
        userId,
        applicationId: entityId,
        jobId,
        jobUrl,
        provider: provider as any,
        candidateData: { ...((brain.data || {}) as any), resumeUrl: resume?.resumeId },
        headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
        approvalMode: false,
      });
      await recordPlaywrightApplyResult({
        userId,
        applicationId: entityId,
        provider,
        result: pwResult,
      });
      const statusEmoji =
        pwResult.status === "APPLIED" ? "✅" : pwResult.status === "PARTIAL" ? "⚠️" : "❌";
      let text = `${statusEmoji} <b>Application Result for ${escapeHtml(companyName)}</b>\n`;
      text += `• Status: ${pwResult.status}\n`;
      if (pwResult.error) text += `• Note: ${escapeHtml(pwResult.error)}\n`;
      if (pwResult.evidenceIds?.length)
        text += `• Evidence records: ${pwResult.evidenceIds.length}\n`;
      return text;
    }
    case "batch_apply_item": {
      const { data: batchItem } = await supabaseAdmin
        .from("batch_apply_items")
        .select("*, jobs!inner(id, url, company_name, title, source)")
        .eq("id", entityId)
        .eq("user_id", userId)
        .single();
      if (!batchItem) return "❌ Batch apply item not found.";
      await supabaseAdmin
        .from("batch_apply_items")
        .update({ status: "approved" })
        .eq("id", entityId)
        .eq("user_id", userId);
      const job: any = batchItem.jobs;
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
        return `❌ Failed to create application: ${appInsert.error?.message}`;
      }
      const applicationId = appInsert.data.id;
      const provider = String(job.source ?? "linkedin").toLowerCase();
      const jobUrl = job.url || "";
      const companyName = job.company_name || "Unknown";
      const [resume, brain] = await Promise.all([
        resolvePrimaryResume(userId),
        supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      const pwResult = await applyWithPlaywright({
        userId,
        applicationId,
        jobId: job.id,
        jobUrl,
        provider: provider as any,
        candidateData: { ...((brain.data || {}) as any), resumeUrl: resume?.resumeId },
        headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
        approvalMode: false,
      });
      await recordPlaywrightApplyResult({ userId, applicationId, provider, result: pwResult });
      const statusEmoji =
        pwResult.status === "APPLIED" ? "✅" : pwResult.status === "PARTIAL" ? "⚠️" : "❌";
      let text = `${statusEmoji} <b>Batch Apply Result for ${escapeHtml(companyName)}</b>\n`;
      text += `• Status: ${pwResult.status}\n`;
      if (pwResult.error) text += `• Note: ${escapeHtml(pwResult.error)}\n`;
      if (pwResult.evidenceIds?.length)
        text += `• Evidence records: ${pwResult.evidenceIds.length}\n`;
      await supabaseAdmin
        .from("batch_apply_items")
        .update({
          application_id: applicationId,
          tracking_url: jobUrl,
          status: pwResult.status === "APPLIED" ? "submitted" : "failed",
        })
        .eq("id", entityId);
      return text;
    }
    case "outreach": {
      const { error } = await supabaseAdmin
        .from("outreach_drafts")
        .update({ status: "approved" })
        .eq("id", entityId)
        .eq("user_id", userId);
      return error ? `❌ Failed to approve: ${error.message}` : "✅ Outreach draft approved!";
    }
    default:
      return `✅ ${entityType} ${entityId} approved.`;
  }
}

async function rejectEntity(
  entityType: string,
  entityId: string,
  userId: string,
  chatId: number,
  messageId?: number,
): Promise<string> {
  switch (entityType) {
    case "application": {
      await supabaseAdmin
        .from("applications")
        .update({ approval_status: "rejected", approval_responded_at: new Date().toISOString() })
        .eq("id", entityId)
        .eq("user_id", userId);
      return "❌ Application rejected.";
    }
    case "batch_apply_item": {
      const { error } = await supabaseAdmin
        .from("batch_apply_items")
        .update({ status: "rejected" })
        .eq("id", entityId)
        .eq("user_id", userId);
      return error ? `❌ Failed to reject: ${error.message}` : "❌ Batch apply item rejected.";
    }
    case "outreach": {
      const { error } = await supabaseAdmin
        .from("outreach_drafts")
        .update({ status: "rejected" })
        .eq("id", entityId)
        .eq("user_id", userId);
      return error ? `❌ Failed to reject: ${error.message}` : "❌ Outreach draft rejected.";
    }
    default:
      return `❌ ${entityType} ${entityId} rejected.`;
  }
}

async function viewEntity(entityType: string, entityId: string, userId: string): Promise<string> {
  if (entityType === "application") {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("*, jobs!inner(title, company_name, url, description)")
      .eq("id", entityId)
      .eq("user_id", userId)
      .single();
    if (!app) return "Application not found.";
    const job = app.jobs || {};
    return `<b>📋 Application Details</b>\n\n<b>Role:</b> ${escapeHtml(job.title || "")}\n<b>Company:</b> ${escapeHtml(job.company_name || "")}\n<b>URL:</b> ${job.url || "N/A"}\n<b>Status:</b> ${app.status}\n<b>Created:</b> ${new Date(app.created_at).toLocaleString()}`;
  }
  return `Viewing ${entityType} ${entityId}`;
}

async function viewAnswers(entityType: string, entityId: string, userId: string): Promise<string> {
  if (entityType === "application") {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("ai_generated_answers")
      .eq("id", entityId)
      .eq("user_id", userId)
      .single();
    if (!app) return "Application not found.";
    const answers = app.ai_generated_answers;
    if (!answers || typeof answers !== "object") return "No generated answers available.";
    let text = "<b>🤖 AI-Generated Answers</b>\n\n";
    for (const [field, answer] of Object.entries(answers)) {
      text += `<b>${escapeHtml(field)}:</b> ${escapeHtml(String(answer).slice(0, 200))}\n\n`;
    }
    return text;
  }
  return `Answers for ${entityType} ${entityId}`;
}

async function submitViaPlaywright(
  userId: string,
  applicationId: string,
  jobUrl: string,
  companyName: string,
  provider: string,
): Promise<string> {
  try {
    const [resume, brain] = await Promise.all([
      supabaseAdmin
        .from("resumes")
        .select("id,storage_path")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .maybeSingle(),
      supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    const result = await applyWithPlaywright({
      userId,
      applicationId,
      jobUrl,
      provider: provider as any,
      candidateData: (brain.data || {}) as any,
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
      approvalMode: false,
    });

    await recordPlaywrightApplyResult({ userId, applicationId, provider, result });

    const statusEmoji =
      result.status === "APPLIED" ? "✅" : result.status === "PARTIAL" ? "⚠️" : "❌";
    let text = `${statusEmoji} <b>Application Result for ${escapeHtml(companyName)}</b>\n`;
    text += `• Status: ${result.status}\n`;
    text += `• Fields submitted: ${result.submittedFields || 0}/${result.totalFields || 0}\n`;
    if (result.evidenceIds?.length) text += `• Evidence records: ${result.evidenceIds.length}\n`;
    if (result.error) text += `• Note: ${escapeHtml(result.error)}\n`;
    return text;
  } catch (err: any) {
    return `❌ Playwright submission failed: ${err.message}`;
  }
}

export async function notifyApplicationForApproval(
  userId: string,
  applicationId: string,
  jobTitle: string,
  companyName: string,
  jobUrl: string,
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId();
  if (!chatId) return { ok: false };

  const text = `<b>📋 Application Approval Needed</b>\n\n<b>Role:</b> ${escapeHtml(jobTitle)}\n<b>Company:</b> ${escapeHtml(companyName)}\n<b>URL:</b> ${jobUrl}\n\n<i>Review the application details before approving.</i>`;

  const buttons: InlineKeyboard = [
    [
      { text: "✅ Approve & Submit", callback_data: `approve:application:${applicationId}` },
      { text: "❌ Reject", callback_data: `reject:application:${applicationId}` },
    ],
    [
      { text: "👁 View Job", callback_data: `view:application:${applicationId}` },
      { text: "📝 View Answers", callback_data: `review:application:${applicationId}` },
    ],
  ];

  const result = await sendTelegramKeyboard(chatId, text, buttons);
  if (result.ok && result.messageId) {
    await supabaseAdmin
      .from("applications")
      .update({ approval_telegram_message_id: result.messageId })
      .eq("id", applicationId);
  }

  return { ok: result.ok };
}

export async function notifyJobImport(
  userId: string,
  source: string,
  count: number,
  sampleJobs?: { title: string; company: string }[],
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId();
  if (!chatId) return { ok: false };

  let text = `📥 <b>Job Import Complete</b>\n• Source: ${source}\n• Jobs imported: ${count}`;
  if (sampleJobs?.length) {
    text +=
      "\n\n<b>Sample:</b>\n" +
      sampleJobs
        .slice(0, 3)
        .map((j) => `• ${escapeHtml(j.title)} @ ${escapeHtml(j.company)}`)
        .join("\n");
  }

  const result = await sendTelegramMessage(chatId, text);
  return { ok: result.ok };
}

export async function notifyRecruiterDiscovery(
  userId: string,
  company: string,
  count: number,
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId();
  if (!chatId) return { ok: false };

  const text = `👥 <b>Recruiters Discovered</b>\n• Company: ${escapeHtml(company)}\n• Recruiters found: ${count}`;
  const result = await sendTelegramMessage(chatId, text);
  return { ok: result.ok };
}

export async function notifyOutreachDraft(
  userId: string,
  draftId: string,
  recipientName: string,
  company: string,
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId();
  if (!chatId) return { ok: false };

  const text = `✉️ <b>New Outreach Draft</b>\n• To: ${escapeHtml(recipientName)} @ ${escapeHtml(company)}\n• Draft ID: ${draftId}`;
  const buttons: InlineKeyboard = [
    [
      { text: "✅ Approve", callback_data: `approve:outreach:${draftId}` },
      { text: "❌ Reject", callback_data: `reject:outreach:${draftId}` },
    ],
  ];
  await sendTelegramKeyboard(chatId, text, buttons);
  return { ok: true };
}

export async function notifyInterview(
  userId: string,
  subject: string,
  snippet: string,
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId();
  if (!chatId) return { ok: false };

  const text = `🎯 <b>Interview Detected</b>\n• Subject: ${escapeHtml(subject)}\n• ${escapeHtml(snippet.slice(0, 200))}`;
  const result = await sendTelegramMessage(chatId, text);
  return { ok: result.ok };
}

export async function notifyAssessment(
  userId: string,
  subject: string,
  snippet: string,
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId();
  if (!chatId) return { ok: false };

  const text = `📝 <b>Assessment Detected</b>\n• Subject: ${escapeHtml(subject)}\n• ${escapeHtml(snippet.slice(0, 200))}`;
  const result = await sendTelegramMessage(chatId, text);
  return { ok: result.ok };
}

export async function notifyOffer(
  userId: string,
  subject: string,
  snippet: string,
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId();
  if (!chatId) return { ok: false };

  const text = `🎉 <b>Offer Detected</b>\n• Subject: ${escapeHtml(subject)}\n• ${escapeHtml(snippet.slice(0, 200))}`;
  const result = await sendTelegramMessage(chatId, text);
  return { ok: result.ok };
}

export async function notifyBatchApplyApproval(
  userId: string,
  runId: string,
  itemCount: number,
  items: { id: string; jobTitle: string; company: string }[],
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId();
  if (!chatId) return { ok: false };

  let text = `📋 <b>Batch Apply — Approval Needed</b>\n• Run ID: ${runId}\n• Items pending: ${itemCount}\n\n`;
  text += items
    .slice(0, 5)
    .map((i) => `• ${escapeHtml(i.jobTitle)} @ ${escapeHtml(i.company)}`)
    .join("\n");
  if (items.length > 5) text += `\n… and ${items.length - 5} more`;

  const rows: InlineKeyboard = [];
  for (const item of items.slice(0, 5)) {
    rows.push([
      {
        text: `✅ ${escapeHtml(item.jobTitle).slice(0, 20)}`,
        callback_data: `approve:batch_apply_item:${item.id}`,
      },
      { text: "❌", callback_data: `reject:batch_apply_item:${item.id}` },
    ]);
  }

  await sendTelegramKeyboard(chatId, text, rows);
  return { ok: true };
}

export async function flushTelegramQueue(): Promise<number> {
  const { data: pending, error } = await supabaseAdmin
    .from("telegram_notifications")
    .select("*")
    .eq("status", "queued")
    .limit(50);

  if (error || !pending?.length) return 0;

  let sent = 0;
  for (const notification of pending) {
    const chatId = (notification as any).chat_id || process.env.TELEGRAM_CHAT_ID;
    if (!chatId) continue;

    const result = await sendTelegramMessage(chatId, (notification as any).message);
    const status = result.ok ? "sent" : "failed";

    await supabaseAdmin
      .from("telegram_notifications")
      .update({
        status,
        sent_at: result.ok ? new Date().toISOString() : null,
        error: result.ok ? null : result.error,
      } as any)
      .eq("id", (notification as any).id);

    if (result.ok) sent++;
  }

  return sent;
}
