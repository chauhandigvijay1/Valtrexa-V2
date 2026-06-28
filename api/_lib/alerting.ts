import { sendTelegramMessage } from "./telegram.js";
import { logger } from "./logger.js";
import {
  ProviderName,
  ProviderControl,
  PROVIDERS,
  getProviderControls,
} from "./provider-controls.js";
import { FailureType } from "./failure-detection.js";

// ─── Types ────────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertEvent {
  provider: ProviderName;
  event: string;
  severity: AlertSeverity;
  rootCause: string;
  evidence?: string;
  suggestedFix?: string;
}

// ─── Chat ID ──────────────────────────────────────────────

const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.ADMIN_CHAT_ID;

function ensureChatId(): string {
  if (!ADMIN_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID or ADMIN_CHAT_ID must be set");
  return ADMIN_CHAT_ID;
}

// ─── Fix Suggestions ──────────────────────────────────────

const FIX_MAP: Record<string, string> = {
  cookie_expired: "Run npx tsx scripts/refresh-cookies.ts or re-authenticate manually",
  session_expired: "Re-authenticate on the provider website",
  login_redirect: "Session expired — re-authenticate or refresh cookies",
  captcha_detected: "Solve CAPTCHA manually or rotate IP/proxy",
  anti_bot_page:
    "Provider detected automation — use real browser profile or reduce request frequency",
  selector_failure: "Provider layout changed — update selectors in the scrape config",
  missing_button: "Button not found — provider UI changed, update selectors",
  layout_change: "Provider site layout changed — review and update scrape logic",
  upload_failure: "Resume upload failed — retry or check file format/size",
  submission_failure: "Application submission failed — provider may have validation errors",
  stuck_workflow: "Workflow is stuck — check worker logs and restart",
  stuck_queue: "BullMQ queue stuck — check Redis and queue consumers",
  repeated_retries: "Repeated retries detected — provider may be blocking or down",
  provider_downtime: "Provider is down — wait for recovery or disable temporarily",
  provider_disabled: "Provider was disabled — investigate failure logs before re-enabling",
  provider_re_enabled: "Provider was re-enabled — verify sessions before resuming operations",
};

function getFix(event: string): string {
  return FIX_MAP[event] || "Investigate and resolve manually";
}

// ─── Alert Builder ────────────────────────────────────────

export function buildAlertText(event: AlertEvent): string {
  const emoji = event.severity === "critical" ? "🚨" : event.severity === "warning" ? "⚠️" : "ℹ️";
  const fix = event.suggestedFix || getFix(event.event);

  return [
    `${emoji} <b>${event.provider.toUpperCase()} — ${event.event.replace(/_/g, " ")}</b>`,
    ``,
    `<b>Provider:</b> ${event.provider}`,
    `<b>Root Cause:</b> ${event.rootCause}`,
    event.evidence ? `<b>Evidence:</b> ${event.evidence}` : null,
    ``,
    `<b>Suggested Fix:</b> ${fix}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Send Alert ───────────────────────────────────────────

export async function sendAlert(event: AlertEvent): Promise<boolean> {
  try {
    const chatId = ensureChatId();
    const text = buildAlertText(event);
    const result = await sendTelegramMessage(chatId, text);
    return result.ok;
  } catch (err) {
    logger.error("Failed to send alert:", err);
    return false;
  }
}

// ─── Convenience Alerts ───────────────────────────────────

export async function alertCookieExpired(provider: ProviderName, detail?: string): Promise<void> {
  await sendAlert({
    provider,
    event: "cookie_expired",
    severity: "critical",
    rootCause: detail || `Cookie for ${provider} has expired`,
    evidence: detail,
  });
}

export async function alertLoginFailure(provider: ProviderName, reason: string): Promise<void> {
  await sendAlert({
    provider,
    event: "login_redirect",
    severity: "critical",
    rootCause: reason,
    evidence: `Page redirected to login`,
  });
}

export async function alertCaptcha(provider: ProviderName): Promise<void> {
  await sendAlert({
    provider,
    event: "captcha_detected",
    severity: "critical",
    rootCause: "CAPTCHA challenge detected by provider",
    evidence: "CAPTCHA iframe or widget found on page",
  });
}

export async function alertAntiBot(provider: ProviderName, detail?: string): Promise<void> {
  await sendAlert({
    provider,
    event: "anti_bot_page",
    severity: "critical",
    rootCause: "Anti-bot detection triggered",
    evidence: detail || "Block page or rate limit message",
  });
}

export async function alertProviderDisabled(
  provider: ProviderName,
  reason: string,
  auto: boolean,
): Promise<void> {
  await sendAlert({
    provider,
    event: "provider_disabled",
    severity: "critical",
    rootCause: auto
      ? `Auto-disabled after repeated failures: ${reason}`
      : `Manually disabled: ${reason}`,
    suggestedFix: auto
      ? "Check failure logs, fix root cause, then re-enable with /provider-enable"
      : "Re-enable with /provider-enable when ready",
  });
}

export async function alertProviderEnabled(provider: ProviderName): Promise<void> {
  await sendAlert({
    provider,
    event: "provider_re_enabled",
    severity: "info",
    rootCause: `Provider ${provider} re-enabled`,
    suggestedFix: "Verify sessions and operations are working correctly",
  });
}

export async function alertWorkflowFailure(
  provider: ProviderName,
  workflow: string,
  error: string,
): Promise<void> {
  await sendAlert({
    provider,
    event: "stuck_workflow",
    severity: "warning",
    rootCause: `Workflow "${workflow}" failed`,
    evidence: error,
  });
}

export async function alertQueueFailure(
  provider: ProviderName,
  queue: string,
  error: string,
): Promise<void> {
  await sendAlert({
    provider,
    event: "stuck_queue",
    severity: "warning",
    rootCause: `Queue "${queue}" stuck`,
    evidence: error,
  });
}

export async function alertApplicationFailure(
  provider: ProviderName,
  jobTitle: string,
  company: string,
  error: string,
): Promise<void> {
  await sendAlert({
    provider,
    event: "submission_failure",
    severity: "warning",
    rootCause: `Failed to submit application for ${jobTitle} at ${company}`,
    evidence: error,
  });
}

export async function alertSelectorFailure(
  provider: ProviderName,
  selector: string,
  context: string,
): Promise<void> {
  await sendAlert({
    provider,
    event: "selector_failure",
    severity: "warning",
    rootCause: `Selector "${selector}" not found`,
    evidence: `Context: ${context}`,
    suggestedFix: "Update selectors in provider configuration",
  });
}

// ─── Daily Health Summary ─────────────────────────────────

export async function sendDailyHealthSummary(userId: string): Promise<void> {
  try {
    const controls = await getProviderControls(userId);
    const chatId = ensureChatId();

    let text = "<b>📊 Daily Provider Health Summary</b>\n\n";

    for (const c of controls) {
      const statusEmoji =
        c.status === "enabled"
          ? "✅"
          : c.status === "disabled"
            ? "❌"
            : c.status === "paused"
              ? "⏸️"
              : "🔧";
      text += `${statusEmoji} <b>${c.provider}</b>: ${c.status}`;
      if (c.consecutive_failures > 0) text += ` | Failures: ${c.consecutive_failures}`;
      if (c.last_failure_at) {
        const ago = Math.round((Date.now() - new Date(c.last_failure_at).getTime()) / 60000);
        text += ` | Last failure: ${ago}m ago`;
      }
      if (c.last_failure_reason) text += `\n  Reason: ${c.last_failure_reason}`;
      text += "\n";
    }

    text += "\n<i>Use /provider-status for live status</i>";
    await sendTelegramMessage(chatId, text);
  } catch (err) {
    logger.error("Failed to send daily summary:", err);
  }
}
