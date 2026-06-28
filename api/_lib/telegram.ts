import { supabaseAdmin } from "./supabase.js";
import { emitWorkflowEvent } from "./workflow-events.js";
import { applyWithPlaywright, recordPlaywrightApplyResult } from "./playwright-apply.js";
import { logger } from "./logger.js";
import { resolvePrimaryResume } from "./apply-engine.js";
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
import {
  getWorkflowState,
  startWorkflow,
  stopWorkflow,
  pauseWorkflow,
  resumeWorkflow,
} from "./workflow-state.js";
import { alertProviderDisabled, alertProviderEnabled } from "./alerting.js";
import { getConfig } from "./workflow-config.js";
import { handleMemoryCallback } from "./dynamic-profile-memory.js";
import {
  validateBindingToken,
  bindTelegramAccount,
  getUserIdByChatId,
  getUserIdByTelegramId,
  sendWelcomeMessage,
} from "./telegram-bindings.js";
import { getCandidateBrain } from "./candidate-brain.js";

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
  } catch (err) {
    logger.warn("[Telegram] answerCallbackQuery failed", err);
  }
}

async function resolveDefaultChatId(userId?: string): Promise<string> {
  if (userId) {
    const { data } = await supabaseAdmin
      .from("telegram_bindings")
      .select("chat_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.chat_id) return String(data.chat_id);
  }
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
  let cmd = parts[0]?.toLowerCase() ?? "";
  cmd = cmd.replace(/-/g, "_");
  return { command: cmd, args: parts.slice(1).join(" ") };
}

async function handleConnectCommand(
  chatId: number,
  token: string,
  fromId?: number,
  username?: string,
  firstName?: string,
): Promise<string> {
  try {
    const validation = await validateBindingToken(token);
    if (!validation.valid) {
      return `❌ Connection failed: ${validation.error ?? "Invalid token."}\n\nGenerate a new token from Settings → Telegram in the web dashboard.`;
    }
    if (!validation.userId) {
      return "❌ Connection failed: No user associated with this token.";
    }
    if (!fromId) {
      return "❌ Connection failed: Could not identify your Telegram account.";
    }

    const result = await bindTelegramAccount(
      validation.userId,
      validation.tokenRowId!,
      fromId,
      chatId,
      username,
      firstName,
    );

    if (!result.ok) {
      return `❌ Connection failed: ${result.error ?? "Unknown error."}`;
    }

    await sendWelcomeMessage(chatId, firstName ?? "User");
    return "";
  } catch (err: any) {
    return `❌ Connection failed: ${err.message}`;
  }
}

async function handleMenuCommand(chatId: number, userId: string): Promise<string> {
  const text = `<b>🤖 VALTREXA-V2 — Main Menu</b>\n\nNavigate the system:`;
  await sendTelegramKeyboard(chatId, text, [
    [
      { text: "📊 Status", callback_data: "menu:status" },
      { text: "👤 Profile", callback_data: "menu:profile" },
    ],
    [
      { text: "💼 Jobs", callback_data: "menu:jobs" },
      { text: "📝 Applications", callback_data: "menu:applications" },
    ],
    [
      { text: "🔧 Providers", callback_data: "menu:providers" },
      { text: "⚙️ Workflow", callback_data: "menu:workflow" },
    ],
    [
      { text: "✅ Approvals", callback_data: "menu:approvals" },
      { text: "📊 Analytics", callback_data: "menu:analytics" },
    ],
    [
      { text: "⚡ Resume", callback_data: "menu:resume" },
      { text: "🧠 Brain", callback_data: "menu:brain" },
    ],
    [
      { text: "❓ Help", callback_data: "menu:help" },
      { text: "🏠 Menu", callback_data: "menu:menu" },
    ],
  ]);
  return "";
}

async function handleHelpCommand(chatId: number): Promise<string> {
  try {
  const text = `<b>🤖 VALTREXA-V2 Commands</b>

<b>General</b>
/health — System health
/status — Dashboard summary
/menu — Main menu
/start — Welcome screen

<b>Jobs & Applications</b>
/jobs — Recent jobs
/applications — Recent applications
/approvals — Pending approvals
/highvalue — High value companies
/followups — Overdue follow-ups
/interviews — Detected interviews
/analytics — Analytics summary

<b>Providers</b>
/provider_status — Provider status
/provider_enable — Enable provider
/provider_disable — Disable provider
/provider_pause — Pause provider
/provider_resume — Resume provider
/provider_history — Provider health log
/refresh_cookies — Check or refresh cookies

<b>Workflow</b>
/workflow_start — Start automation
/workflow_stop — Stop automation
/workflow_pause — Pause automation
/workflow_resume — Resume automation
/workflow_status — Check status

<b>Operations</b>
/queue_status — Queue status
/jobs_imported — Import stats
/applications_today — Today's count
/matching_status — Match results
/recruiters_found — Discovered recruiters
/outreach_status — Outreach status

<b>Account</b>
/connect — Link Telegram to web dashboard`;
  return text;
  } catch (err: any) {
    return `❌ Error loading help: ${escapeHtml(err.message)}`;
  }
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

async function handleProviderStatusCommand(chatId: number, userId: string): Promise<string> {
  try {
    const controls = await getProviderControls(userId);
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

async function handleProviderEnableCommand(
  chatId: number,
  provider: string,
  userId: string,
): Promise<string> {
  const p = provider.toLowerCase() as ProviderName;
  if (!PROVIDERS.includes(p)) return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
  try {
    const control = await getProviderControl(p, userId);
    if (!control) return `Provider "${p}" not found.`;
    if (control.status === "enabled") return `Provider "${p}" is already enabled.`;
    await setProviderStatus(p, "enabled", userId, "telegram");
    await alertProviderEnabled(p);
    return `✅ Provider "${p}" has been enabled.`;
  } catch (err: any) {
    return `Failed to enable "${p}": ${escapeHtml(err.message)}`;
  }
}

async function handleProviderDisableCommand(
  chatId: number,
  provider: string,
  userId: string,
): Promise<string> {
  const p = provider.toLowerCase() as ProviderName;
  if (!PROVIDERS.includes(p)) return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
  try {
    const control = await getProviderControl(p, userId);
    if (!control) return `Provider "${p}" not found.`;
    if (control.status === "disabled") return `Provider "${p}" is already disabled.`;
    await setProviderStatus(p, "disabled", userId, "telegram");
    await alertProviderDisabled(p, "Disabled via Telegram", false);
    return `❌ Provider "${p}" has been disabled.`;
  } catch (err: any) {
    return `Failed to disable "${p}": ${escapeHtml(err.message)}`;
  }
}

async function handleProviderPauseCommand(
  chatId: number,
  provider: string,
  userId: string,
): Promise<string> {
  const p = provider.toLowerCase() as ProviderName;
  if (!PROVIDERS.includes(p)) return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
  try {
    const control = await getProviderControl(p, userId);
    if (!control) return `Provider "${p}" not found. Enable it first via the web dashboard.`;
    await setProviderStatus(p, "paused", userId, "telegram");
    return `⏸️ Provider "${p}" has been paused.`;
  } catch (err: any) {
    return `Failed to pause "${p}": ${escapeHtml(err.message)}`;
  }
}

async function handleProviderResumeCommand(
  chatId: number,
  provider: string,
  userId: string,
): Promise<string> {
  const p = provider.toLowerCase() as ProviderName;
  if (!PROVIDERS.includes(p)) return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
  try {
    const control = await getProviderControl(p, userId);
    if (!control) return `Provider "${p}" not found. Enable it first via the web dashboard.`;
    await setProviderStatus(p, "enabled", userId, "telegram");
    return `▶️ Provider "${p}" has been resumed.`;
  } catch (err: any) {
    return `Failed to resume "${p}": ${escapeHtml(err.message)}`;
  }
}

async function handleRefreshCookiesCommand(
  chatId: number,
  userId: string,
  input: string,
): Promise<string> {
  const parts = input.split(/\s+/);
  const provider = parts[0]?.toLowerCase();
  const newCookie = parts.slice(1).join(" ");

  if (!provider) {
    const { checkAllCookies } = await import("./cookie-manager.js");
    const results = await checkAllCookies(userId);
    let text = "<b>🍪 Cookie Status</b>\n\n";
    for (const [p, r] of Object.entries(results)) {
      const icon = r.status === "valid" ? "✅" : r.status === "expired" ? "❌" : "⚠️";
      text += `${icon} <b>${p}</b>: ${r.message}\n`;
    }
    return text;
  }

  const {
    SUPPORTED_PROVIDERS,
    checkProviderCookie,
    refreshProviderCookie,
    refreshCookieViaPlaywright,
    getLoginGuide,
  } = await import("./cookie-manager.js");

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return `Unknown provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(", ")}`;
  }

  if (newCookie) {
    const result = await refreshProviderCookie(userId, provider, newCookie);
    return result.ok ? `✅ ${result.message}` : `❌ ${result.message}`;
  }

  // No cookie provided — check current status first
  const status = await checkProviderCookie(userId, provider);
  if (status.status === "valid") {
    return `✅ ${provider} cookie is already valid.`;
  }

  // Try automated refresh
  const autoResult = await refreshCookieViaPlaywright(userId, provider);
  return autoResult.message;
}

async function handleProviderHistoryCommand(
  chatId: number,
  userId: string,
  provider?: string,
): Promise<string> {
  try {
    const p = provider?.toLowerCase() as ProviderName | undefined;
    if (p && !PROVIDERS.includes(p))
      return `Unknown provider: ${provider}. Try: ${PROVIDERS.join(", ")}`;
    const logs = await getHealthLog(userId, p, 10);
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

// ─── Workflow Command Handlers ────────────────────────────

async function handleWorkflowStartCommand(chatId: number, userId: string): Promise<string> {
  try {
    const state = await startWorkflow(userId, "telegram");
    return `▶️ <b>Workflow Started</b>\nStarted by: @${userId.substring(0, 8)}\nTime: ${new Date(state.started_at!).toLocaleString()}`;
  } catch (err: any) {
    if (err.message === "Workflow is already running") return "⚠️ Workflow is already running.";
    return `Failed to start workflow: ${escapeHtml(err.message)}`;
  }
}

async function handleWorkflowStopCommand(chatId: number, userId: string): Promise<string> {
  try {
    const state = await stopWorkflow(userId, "telegram");
    return `⏹️ <b>Workflow Stopped</b>\nStopped by: @${userId.substring(0, 8)}\nTime: ${new Date(state.stopped_at!).toLocaleString()}`;
  } catch (err: any) {
    if (err.message === "Workflow is already stopped") return "⏹️ Workflow is already stopped.";
    return `Failed to stop workflow: ${escapeHtml(err.message)}`;
  }
}

async function handleWorkflowPauseCommand(chatId: number, userId: string): Promise<string> {
  try {
    const state = await pauseWorkflow(userId, "telegram");
    return `⏸️ <b>Workflow Paused</b>\nPaused by: @${userId.substring(0, 8)}\nTime: ${new Date(state.paused_at!).toLocaleString()}`;
  } catch (err: any) {
    if (err.message === "Workflow is not running")
      return "⚠️ Workflow is not running — nothing to pause.";
    return `Failed to pause workflow: ${escapeHtml(err.message)}`;
  }
}

async function handleWorkflowResumeCommand(chatId: number, userId: string): Promise<string> {
  try {
    const state = await resumeWorkflow(userId, "telegram");
    return `▶️ <b>Workflow Resumed</b>\nResumed by: @${userId.substring(0, 8)}\nTime: ${new Date(state.resumed_at!).toLocaleString()}`;
  } catch (err: any) {
    if (err.message === "Workflow is not paused")
      return "⚠️ Workflow is not paused — nothing to resume.";
    return `Failed to resume workflow: ${escapeHtml(err.message)}`;
  }
}

async function handleWorkflowStatusCommand(chatId: number, userId: string): Promise<string> {
  try {
    const state = await getWorkflowState(userId);
    if (!state) return "❓ No workflow state found.";
    const emoji = state.status === "running" ? "▶️" : state.status === "paused" ? "⏸️" : "⏹️";
    let text = `${emoji} <b>Workflow Status: ${state.status.toUpperCase()}</b>\n\n`;
    if (state.started_at) text += `Started: ${new Date(state.started_at).toLocaleString()}\n`;
    if (state.stopped_at) text += `Stopped: ${new Date(state.stopped_at).toLocaleString()}\n`;
    if (state.paused_at) text += `Paused: ${new Date(state.paused_at).toLocaleString()}\n`;
    if (state.resumed_at) text += `Resumed: ${new Date(state.resumed_at).toLocaleString()}\n`;
    if (state.started_by) text += `Last action by: ${state.started_by}\n`;
    if (state.error) text += `Error: ${state.error}\n`;
    return text;
  } catch (err: any) {
    return `Failed to get workflow status: ${escapeHtml(err.message)}`;
  }
}

// ─── Operations Command Handlers ──────────────────────────

async function handleQueueStatusCommand(chatId: number, userId: string): Promise<string> {
  try {
    const { data: pendingJobs } = await supabaseAdmin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("processed_at", null);

    const { data: unmatched } = await supabaseAdmin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("matched", null);

    const { data: pendingApps } = await supabaseAdmin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending");

    const config = getConfig();
    return (
      `<b>📊 Operations Queue</b>\n\n` +
      `<b>Job Import Queue:</b>\n` +
      `  • Unprocessed: ${pendingJobs ?? 0}\n` +
      `  • Unmatched: ${unmatched ?? 0}\n` +
      `  • Interval: Every ${config.jobImportIntervalMinutes}m\n\n` +
      `<b>Matching Queue:</b>\n` +
      `  • Pending Review: ${pendingApps ?? 0}\n` +
      `  • Threshold: ${config.matchThresholdPercent}%\n` +
      `  • Interval: Every ${config.matchingIntervalMinutes}m\n\n` +
      `<b>Application Queue:</b>\n` +
      `  • Max/Cycle: ${config.maxApplicationsPerCycle}\n` +
      `  • Interval: Every ${config.outreachIntervalHours}h\n\n` +
      `<i>Last auto-refresh: ${new Date().toLocaleTimeString()}</i>`
    );
  } catch (err: any) {
    return `Failed to get queue status: ${escapeHtml(err.message)}`;
  }
}

async function handleJobsImportedCommand(chatId: number, userId: string): Promise<string> {
  try {
    const { data: jobs, count } = await supabaseAdmin
      .from("jobs")
      .select("id, provider, created_at, matched, match_score", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!jobs || jobs.length === 0) return "No jobs imported yet.";

    const grouped: Record<string, { total: number; matched: number }> = {};
    for (const j of jobs) {
      if (!grouped[j.provider]) grouped[j.provider] = { total: 0, matched: 0 };
      grouped[j.provider].total++;
      if (j.matched) grouped[j.provider].matched++;
    }

    const totalCount = count ?? jobs.length;
    let text = `<b>📥 Jobs Imported: ${totalCount}</b>\n\n`;
    for (const [provider, stats] of Object.entries(grouped)) {
      text += `<b>${provider}</b>: ${stats.total} total, ${stats.matched} matched\n`;
    }
    const matched = jobs.filter((j) => j.matched).length;
    text += `\n<b>Total Matched:</b> ${matched}/${totalCount} (${totalCount > 0 ? Math.round((matched / totalCount) * 100) : 0}%)\n`;
    const avgScore = jobs
      .filter((j) => j.match_score)
      .reduce((a, b) => a + (b.match_score ?? 0), 0);
    text += `<b>Avg Match Score:</b> ${matched > 0 ? Math.round(avgScore / matched) : "N/A"}%\n`;
    return text;
  } catch (err: any) {
    return `Failed to get jobs: ${escapeHtml(err.message)}`;
  }
}

async function handleApplicationsTodayCommand(chatId: number, userId: string): Promise<string> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: todayApps, count } = await supabaseAdmin
      .from("applications")
      .select("id, status, provider, created_at", { count: "exact" })
      .eq("user_id", userId)
      .gte("created_at", today);

    const { data: totalApps } = await supabaseAdmin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (!todayApps || todayApps.length === 0) {
      return `<b>📋 Applications Today: 0</b>\n\nNo applications submitted today.\n<b>All-time:</b> ${totalApps ?? 0}`;
    }

    const grouped: Record<string, number> = {};
    for (const a of todayApps) {
      grouped[a.status] = (grouped[a.status] ?? 0) + 1;
    }

    let text = `<b>📋 Applications Today: ${count}</b>\n`;
    for (const [status, num] of Object.entries(grouped)) {
      text += `  • ${status}: ${num}\n`;
    }
    text += `\n<b>All-time:</b> ${totalApps ?? 0}\n`;
    text += `<b>By Provider:</b>\n`;
    const byProv: Record<string, number> = {};
    for (const a of todayApps) {
      byProv[a.provider] = (byProv[a.provider] ?? 0) + 1;
    }
    for (const [prov, num] of Object.entries(byProv)) {
      text += `  • ${prov}: ${num}\n`;
    }
    return text;
  } catch (err: any) {
    return `Failed to get applications: ${escapeHtml(err.message)}`;
  }
}

async function handleRecruitersFoundCommand(chatId: number, userId: string): Promise<string> {
  try {
    const { data: recruiters, count } = await supabaseAdmin
      .from("recruiters")
      .select("id, name, company, title, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!recruiters || recruiters.length === 0) {
      return "<b>👥 Recruiters Found: 0</b>\n\nNo recruiters discovered yet. Run the workflow to start discovery.";
    }

    let text = `<b>👥 Recruiters Found: ${count}</b>\n\nLast 10:\n`;
    for (const r of recruiters) {
      text += `• <b>${escapeHtml(r.name)}</b>\n  ${escapeHtml(r.title ?? "")} @ ${escapeHtml(r.company ?? "")}\n`;
    }
    return text;
  } catch (err: any) {
    return `Failed to get recruiters: ${escapeHtml(err.message)}`;
  }
}

async function handleOutreachStatusCommand(chatId: number, userId: string): Promise<string> {
  try {
    const [draftsResult, messagesResult] = await Promise.all([
      supabaseAdmin
        .from("outreach_drafts")
        .select("id, status, created_at", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("outreach_messages")
        .select("id, status, created_at", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const drafts = draftsResult.data ?? [];
    const messages = messagesResult.data ?? [];
    const totalDrafts = draftsResult.count ?? 0;
    const totalMessages = messagesResult.count ?? 0;

    if (totalDrafts === 0 && totalMessages === 0) {
      return "<b>📤 Outreach Status: 0</b>\n\nNo outreach generated yet. Run the workflow to start generating.";
    }

    const pendingDrafts = drafts.filter((d) => d.status === "pending").length;
    const sentMessages = messages.filter((m) => m.status === "sent").length;
    const draftMessages = messages.filter((m) => m.status === "draft").length;

    let text = `<b>📤 Outreach Status</b>\n\n`;
    text += `📝 Pending Approval: ${pendingDrafts}\n`;
    text += `✅ Sent: ${sentMessages}\n`;
    text += `📄 Draft Messages: ${draftMessages}\n`;
    text += `📊 Total Drafts: ${totalDrafts}\n`;
    text += `📊 Total Messages: ${totalMessages}\n\n`;

    if (drafts.length > 0 || messages.length > 0) {
      text += `<b>Recent Drafts:</b>\n`;
      for (const d of drafts.slice(0, 3)) {
        const date = new Date(d.created_at).toLocaleDateString();
        text += `  • ${d.status} — ${date}\n`;
      }
      text += `\n<b>Recent Messages:</b>\n`;
      for (const m of messages.slice(0, 3)) {
        const date = new Date(m.created_at).toLocaleDateString();
        text += `  • ${m.status} — ${date}\n`;
      }
    }
    return text;
  } catch (err: any) {
    return `Failed to get outreach: ${escapeHtml(err.message)}`;
  }
}

async function handleMatchingStatusCommand(chatId: number, userId: string): Promise<string> {
  try {
    const { data: matches, count } = await supabaseAdmin
      .from("jobs")
      .select("id, title, provider, match_score, matched_skills, matched", { count: "exact" })
      .eq("user_id", userId)
      .not("match_score", "is", null)
      .order("match_score", { ascending: false })
      .limit(10);

    if (!matches || matches.length === 0) {
      return "<b>🎯 Matching Status</b>\n\nNo jobs have been matched yet. Run the workflow to start matching.";
    }

    const matched = matches.filter((m) => m.matched).length;
    const avg = Math.round(matches.reduce((a, b) => a + (b.match_score ?? 0), 0) / matches.length);

    let text = `<b>🎯 Matching Status</b>\n\n`;
    text += `Processed: ${count}\n`;
    text += `Matched: ${matched}\n`;
    text += `Avg Score: ${avg}%\n\n`;
    text += `<b>Top Matches:</b>\n`;
    for (const m of matches.slice(0, 5)) {
      const icon = m.matched ? "✅" : "❌";
      text += `${icon} <b>${escapeHtml(m.title)}</b> @ ${m.provider}\n`;
      text += `   Score: ${m.match_score}% | Skills: ${(m.matched_skills ?? []).length}\n`;
    }
    return text;
  } catch (err: any) {
    return `Failed to get matching: ${escapeHtml(err.message)}`;
  }
}

export async function processTelegramUpdate(
  body: TelegramUpdate,
  userId: string,
): Promise<{ handled: boolean; response?: string }> {
  try {
    if (body.message?.text) {
      const chatId = body.message.chat.id;
      const fromId = body.message.from?.id;
      const firstName = body.message.from?.first_name;
      const username = body.message.from?.username;
      const { command, args } = parseCommand(body.message.text);
      let responseText: string;

      // Handle unauthenticated connect flow
      if (command === "/connect") {
        if (!args) {
          responseText = "Usage: /connect <token>\n\nGenerate a token from Settings in the web dashboard, then send it here to link your account.";
          await sendTelegramMessage(chatId, responseText);
          return { handled: true, response: responseText };
        }
        responseText = await handleConnectCommand(chatId, args.trim(), fromId, username, firstName);
        if (responseText) {
          await sendTelegramMessage(chatId, responseText);
        }
        return { handled: true, response: responseText };
      }

      // Handle /start with deep-link token
      if (command === "/start" && args && args.startsWith("connect_")) {
        const token = args.replace("connect_", "").trim();
        responseText = await handleConnectCommand(chatId, token, fromId, username, firstName);
        if (responseText) {
          await sendTelegramMessage(chatId, responseText);
        }
        return { handled: true, response: responseText };
      }

      // Binding check for all commands except unauthenticated ones
      if (!userId && command !== "/health" && command !== "/start" && command !== "/help" && command !== "/menu") {
        await sendTelegramMessage(chatId, "❌ Your Telegram account is not connected.\n\nUse /connect <token> to link your account, or generate a token from the web dashboard Settings page.");
        return { handled: true };
      }

      switch (command) {
        case "/health":
        case "/start":
          responseText = await handleHealthCommand(chatId);
          break;
        case "/menu":
          responseText = await handleMenuCommand(chatId, userId);
          break;
        case "/help":
          responseText = await handleHelpCommand(chatId);
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
        case "/provider_status":
          responseText = await handleProviderStatusCommand(chatId, userId);
          break;
        case "/provider_history":
          responseText = await handleProviderHistoryCommand(chatId, userId, args.trim() || undefined);
          break;
        case "/provider_enable":
          responseText = await handleProviderEnableCommand(chatId, args.trim(), userId);
          break;
        case "/provider_disable":
          responseText = await handleProviderDisableCommand(chatId, args.trim(), userId);
          break;
        case "/provider_pause":
          responseText = await handleProviderPauseCommand(chatId, args.trim(), userId);
          break;
        case "/provider_resume":
          responseText = await handleProviderResumeCommand(chatId, args.trim(), userId);
          break;
        case "/refresh_cookies":
        case "/refresh-cookies":
          responseText = await handleRefreshCookiesCommand(chatId, userId, args.trim());
          break;
        case "/workflow_start":
          responseText = await handleWorkflowStartCommand(chatId, userId);
          break;
        case "/workflow_stop":
          responseText = await handleWorkflowStopCommand(chatId, userId);
          break;
        case "/workflow_pause":
          responseText = await handleWorkflowPauseCommand(chatId, userId);
          break;
        case "/workflow_resume":
          responseText = await handleWorkflowResumeCommand(chatId, userId);
          break;
        case "/workflow_status":
          responseText = await handleWorkflowStatusCommand(chatId, userId);
          break;
        case "/queue_status":
          responseText = await handleQueueStatusCommand(chatId, userId);
          break;
        case "/jobs_imported":
          responseText = await handleJobsImportedCommand(chatId, userId);
          break;
        case "/applications_today":
          responseText = await handleApplicationsTodayCommand(chatId, userId);
          break;
        case "/recruiters_found":
          responseText = await handleRecruitersFoundCommand(chatId, userId);
          break;
        case "/outreach_status":
          responseText = await handleOutreachStatusCommand(chatId, userId);
          break;
        case "/matching_status":
          responseText = await handleMatchingStatusCommand(chatId, userId);
          break;
        default:
          return { handled: false };
      }

      if (responseText) {
        await sendTelegramMessage(chatId, responseText);
      }
      return { handled: true, response: responseText };
    }

    if (body.callback_query) {
      const { id: cbId, data, from, message } = body.callback_query;
      const chatId = message?.chat.id;
      if (!userId) {
        if (chatId) {
          await answerCallbackQuery(cbId, "❌ Please connect your Telegram account first using /connect");
        }
        return { handled: true };
      }
      if (data && chatId) {
        await handleCallbackQuery(cbId, data, chatId, userId, message?.message_id);
      }
      return { handled: true };
    }

    return { handled: false };
  } catch (err: any) {
    logger.error("processTelegramUpdate unhandled error:", err?.message ?? err);
    if (body?.message?.chat?.id) {
      await sendTelegramMessage(body.message.chat.id, "❌ An unexpected error occurred. Please try again.");
    }
    return { handled: true, response: "Error" };
  }
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
    case "skip":
      responseText = await skipEntity(entityType, entityId, userId);
      break;
    case "retry":
      responseText = await retryEntity(entityType, entityId, userId, chatId, messageId);
      break;
    case "view":
      responseText = await viewEntity(entityType, entityId, userId);
      break;
    case "review":
      responseText = await viewAnswers(entityType, entityId, userId);
      break;
    case "open_job":
      responseText = await openJob(entityType, entityId, userId);
      break;
    case "open_company":
      responseText = await openCompany(entityType, entityId, userId);
      break;
    case "approve_all": {
      const { count, errors } = await approveAllPending(userId);
      responseText = `✅ Approved ${count} pending items.${errors ? ` ${errors} errors.` : ""}`;
      break;
    }
    case "reject_all": {
      const { count } = await rejectAllPending(userId);
      responseText = `❌ Rejected ${count} pending items.`;
      break;
    }
    case "approve_high_value": {
      const { count } = await approveHighValueOnly(userId);
      responseText = `✅ Approved ${count} high-value items.`;
      break;
    }
    case "reject_low_match": {
      const { count } = await rejectLowMatch(userId);
      responseText = `❌ Rejected ${count} low-match items.`;
      break;
    }
    case "menu": {
      switch (entityType) {
        case "status":
          responseText = await handleStatusCommand(chatId, userId);
          break;
        case "providers":
          responseText = await handleProviderStatusCommand(chatId, userId);
          break;
        case "workflow_start":
          responseText = await handleWorkflowStartCommand(chatId, userId);
          break;
        case "workflow":
          responseText = await handleWorkflowStatusCommand(chatId, userId);
          break;
        case "profile":
          responseText = await handleStatusCommand(chatId, userId);
          break;
        case "jobs":
          responseText = await handleJobsCommand(chatId, userId);
          break;
        case "applications":
          responseText = await handleApplicationsCommand(chatId, userId);
          break;
        case "resume":
          responseText = "📄 Upload your resume from the web dashboard → Settings → Resume";
          break;
        case "brain":
          responseText = "🧠 View/edit your Candidate Brain from the web dashboard.";
          break;
        case "approvals":
          responseText = await handleApprovalsCommand(chatId, userId);
          break;
        case "analytics":
          responseText = await handleAnalyticsCommand(chatId, userId);
          break;
        case "help":
          responseText = await handleHelpCommand(chatId);
          break;
        case "menu":
          responseText = await handleMenuCommand(chatId, userId);
          break;
        default:
          responseText = `Unknown menu action: ${entityType}`;
      }
      break;
    }
    case "retry_failed": {
      const { count } = await retryFailedItems(userId);
      responseText = `🔄 Retrying ${count} failed items.`;
      break;
    }
    case "memory":
      responseText = await handleMemoryCallback(
        entityType,
        entityId,
        parts.slice(3).join(":"),
        userId,
      );
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

async function skipEntity(entityType: string, entityId: string, userId: string): Promise<string> {
  switch (entityType) {
    case "application": {
      await supabaseAdmin
        .from("applications")
        .update({ status: "skipped", approval_status: "skipped" })
        .eq("id", entityId)
        .eq("user_id", userId)
        .eq("user_id", userId);
      return "⏭️ Application skipped.";
    }
    default:
      return `⏭️ ${entityType} ${entityId} skipped.`;
  }
}

async function retryEntity(
  entityType: string,
  entityId: string,
  userId: string,
  chatId: number,
  messageId?: number,
): Promise<string> {
  if (entityType === "application") {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("*, jobs!inner(id, url, company_name, source)")
      .eq("id", entityId)
      .eq("user_id", userId)
      .single();
    if (!app) return "❌ Application not found.";
    const provider = String(app.jobs?.source || "linkedin").toLowerCase();
    const jobUrl = app.jobs?.url || "";
    const jobId = app.jobs?.id;
    await supabaseAdmin
      .from("applications")
      .update({ approval_status: "approved", retry_count: (app.retry_count ?? 0) + 1 })
      .eq("id", entityId)
      .eq("user_id", userId);
    return await approveEntity("application", entityId, userId, chatId, messageId);
  }
  return `🔄 Retrying ${entityType} ${entityId}`;
}

async function openJob(entityType: string, entityId: string, userId: string): Promise<string> {
  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("job_id")
    .eq("id", entityId)
    .eq("user_id", userId)
    .single();
  if (!app?.job_id) return "❌ Application not found.";
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("url")
    .eq("id", app.job_id)
    .single();
  return job?.url ? `🔗 Open job: ${job.url}` : "❌ Job URL not found.";
}

async function openCompany(entityType: string, entityId: string, userId: string): Promise<string> {
  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("company_name")
    .eq("id", entityId)
    .eq("user_id", userId)
    .single();
  if (!app?.company_name) return "❌ Application not found.";
  const searchUrl = `https://google.com/search?q=${encodeURIComponent(app.company_name + " careers")}`;
  return `🔗 ${app.company_name}: ${searchUrl}`;
}

async function approveAllPending(userId: string): Promise<{ count: number; errors?: string }> {
  const { data: pending } = await supabaseAdmin
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .is("approval_status", null);
  if (!pending?.length) return { count: 0 };
  let errors = 0;
  for (const p of pending) {
    const { error } = await supabaseAdmin
      .from("applications")
      .update({ approval_status: "approved", approval_responded_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("user_id", userId);
    if (error) errors++;
  }
  return { count: pending.length, errors: errors > 0 ? `${errors} failed` : undefined };
}

async function rejectAllPending(userId: string): Promise<{ count: number }> {
  const { data: pending } = await supabaseAdmin
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["pending", "saved"])
    .is("approval_status", null);
  if (!pending?.length) return { count: 0 };
  const ids = pending.map((p) => p.id);
  await supabaseAdmin.from("applications").update({ approval_status: "rejected" }).in("id", ids).eq("user_id", userId);
  return { count: ids.length };
}

async function approveHighValueOnly(userId: string): Promise<{ count: number }> {
  const { data: pending } = await supabaseAdmin
    .from("applications")
    .select("id, job_id, company_name")
    .eq("user_id", userId)
    .in("status", ["pending", "saved"])
    .is("approval_status", null);
  if (!pending?.length) return { count: 0 };
  let approved = 0;
  for (const app of pending) {
    const companyName = app.company_name;
    if (!companyName) continue;
    const { data: company } = await supabaseAdmin
      .from("company_strategic_value")
      .select("id")
      .eq("company_name", companyName)
      .gte("strategic_value_score", 70)
      .maybeSingle();
    if (company) {
      await supabaseAdmin
        .from("applications")
        .update({ approval_status: "approved", approval_note: "high_value" })
        .eq("id", app.id)
        .eq("user_id", userId);
      approved++;
    }
  }
  return { count: approved };
}

async function rejectLowMatch(userId: string): Promise<{ count: number }> {
  const { data: lowMatch } = await supabaseAdmin
    .from("jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("matched", false)
    .lt("match_score", 50);
  if (!lowMatch?.length) return { count: 0 };
  const jobIds = lowMatch.map((j) => j.id);
  await supabaseAdmin
    .from("applications")
    .update({ approval_status: "rejected", approval_note: "low_match" })
    .in("job_id", jobIds)
    .eq("user_id", userId);
  return { count: jobIds.length };
}

async function retryFailedItems(userId: string): Promise<{ count: number }> {
  const { data: failed } = await supabaseAdmin
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "failed");
  if (!failed?.length) return { count: 0 };
  const ids = failed.map((f) => f.id);
  await supabaseAdmin
    .from("applications")
    .update({ status: "pending", approval_status: null, retry_count: 0 })
    .in("id", ids)
    .eq("user_id", userId);
  return { count: ids.length };
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

      const [resume, brain] = await Promise.all([
        resolvePrimaryResume(userId),
        getCandidateBrain(userId),
      ]);
      const pwResult = await applyWithPlaywright({
        userId,
        applicationId: entityId,
        jobId,
        jobUrl,
        provider: provider as any,
        candidateData: {
          ...(brain ?? { profile: {}, baseProfile: {} }),
          resumeUrl: resume?.resumeId,
        },
        headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
        approvalMode: false,
      });

      const approvedStatus = pwResult.status === "APPLIED" || pwResult.status === "PARTIAL" ? "approved" : "failed";
      await supabaseAdmin
        .from("applications")
        .update({ approval_status: approvedStatus, approval_responded_at: new Date().toISOString() })
        .eq("id", entityId)
        .eq("user_id", userId);

      await emitWorkflowEvent({
        userId,
        eventType: "application_approved",
        entityType: "applications",
        entityId,
        payload: { approvedAt: new Date().toISOString(), applicationResult: pwResult.status },
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
        getCandidateBrain(userId),
      ]);
      const pwResult = await applyWithPlaywright({
        userId,
        applicationId,
        jobId: job.id,
        jobUrl,
        provider: provider as any,
        candidateData: {
          ...(brain ?? { profile: {}, baseProfile: {} }),
          resumeUrl: resume?.resumeId,
        },
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
        .eq("user_id", userId)
        .eq("id", entityId);
      return text;
    }
    case "outreach": {
      const { data: draft, error: fetchErr } = await supabaseAdmin
        .from("outreach_drafts")
        .select("*")
        .eq("id", entityId)
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchErr || !draft) return "❌ Outreach draft not found.";

      const { error: updateErr } = await supabaseAdmin
        .from("outreach_drafts")
        .update({ status: "approved" })
        .eq("id", entityId)
        .eq("user_id", userId);
      if (updateErr) return `❌ Failed to approve: ${updateErr.message}`;

      // Create outreach_messages record for the send pipeline
      const { error: insertErr } = await supabaseAdmin
        .from("outreach_messages")
        .insert({
          user_id: userId,
          company_name: draft.company_name,
          recipient_name: draft.recipient_name ?? "Unknown",
          recipient_email: draft.recipient_email ?? "",
          subject: draft.subject,
          body: draft.body,
          status: "pending",
          source: "telegram_approval",
        } as any);
      if (insertErr) {
        logger.error("Failed to create outreach_message from approved draft", { error: insertErr.message, userId, draftId: entityId });
        return "✅ Draft approved, but send queue creation failed — please use /outreach to send manually.";
      }

      return "✅ Outreach draft approved and queued for sending!";
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
      getCandidateBrain(userId),
    ]);

    const result = await applyWithPlaywright({
      userId,
      applicationId,
      jobUrl,
      provider: provider as any,
      candidateData: (brain ?? { profile: {}, baseProfile: {} }) as any,
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
  const chatId = await resolveDefaultChatId(userId);
  if (!chatId) return { ok: false };

  const text = `<b>📋 Application Approval Needed</b>\n\n<b>Role:</b> ${escapeHtml(jobTitle)}\n<b>Company:</b> ${escapeHtml(companyName)}\n<b>URL:</b> ${jobUrl}\n\n<i>Review the application details before approving.</i>`;

  const buttons: InlineKeyboard = [
    [
      { text: "✅ Approve & Submit", callback_data: `approve:application:${applicationId}` },
      { text: "❌ Reject", callback_data: `reject:application:${applicationId}` },
    ],
    [
      { text: "⏭️ Skip", callback_data: `skip:application:${applicationId}` },
      { text: "🔄 Retry", callback_data: `retry:application:${applicationId}` },
    ],
    [
      { text: "👁 Open Job", callback_data: `open_job:application:${applicationId}` },
      { text: "🏢 Open Company", callback_data: `open_company:application:${applicationId}` },
    ],
    [{ text: "📝 View Answers", callback_data: `review:application:${applicationId}` }],
  ];

  const result = await sendTelegramKeyboard(chatId, text, buttons);
  if (result.ok && result.messageId) {
    await supabaseAdmin
      .from("applications")
      .update({ approval_telegram_message_id: result.messageId })
      .eq("id", applicationId)
      .eq("user_id", userId);
  }

  return { ok: result.ok };
}

export async function notifyJobImport(
  userId: string,
  source: string,
  count: number,
  sampleJobs?: { title: string; company: string }[],
): Promise<{ ok: boolean }> {
  const chatId = await resolveDefaultChatId(userId);
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
  const chatId = await resolveDefaultChatId(userId);
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
  const chatId = await resolveDefaultChatId(userId);
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
  const chatId = await resolveDefaultChatId(userId);
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
  const chatId = await resolveDefaultChatId(userId);
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
  const chatId = await resolveDefaultChatId(userId);
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
  const chatId = await resolveDefaultChatId(userId);
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

  rows.push([
    { text: "✅ Approve All", callback_data: `approve_all:batch:${runId}` },
    { text: "❌ Reject All", callback_data: `reject_all:batch:${runId}` },
  ]);

  rows.push([
    { text: "🏆 High Value Only", callback_data: `approve_high_value:batch:${runId}` },
    { text: "🔁 Retry Failed", callback_data: `retry_failed:batch:${runId}` },
  ]);

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
    const chatId = (notification as any).chat_id;
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
      .eq("id", (notification as any).id)
      .eq("user_id", (notification as any).user_id ?? "");

    if (result.ok) sent++;
  }

  return sent;
}
