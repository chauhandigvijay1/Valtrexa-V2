const TELEGRAM_API_BASE = `https://api.telegram.org/bot`;

const BOT_COMMANDS = [
  { command: "health", description: "System health check" },
  { command: "start", description: "System health check" },
  { command: "status", description: "Dashboard summary (jobs, apps, interviews)" },
  { command: "jobs", description: "Recent 10 job imports" },
  { command: "applications", description: "Recent 10 applications" },
  { command: "recruiters", description: "Discovered recruiters" },
  { command: "interviews", description: "Upcoming interviews" },
  { command: "analytics", description: "System analytics" },
  { command: "approvals", description: "Pending approvals" },
  { command: "highvalue", description: "High value companies" },
  { command: "followups", description: "Overdue follow-ups" },
  { command: "provider_status", description: "Provider status overview" },
  { command: "provider_enable", description: "Enable a provider" },
  { command: "provider_disable", description: "Disable a provider" },
  { command: "provider_pause", description: "Pause a provider" },
  { command: "provider_resume", description: "Resume a provider" },
  { command: "provider_history", description: "Provider downtime history" },
  { command: "workflow_start", description: "Start the automation workflow" },
  { command: "workflow_stop", description: "Stop the automation workflow" },
  { command: "workflow_pause", description: "Pause the automation workflow" },
  { command: "workflow_resume", description: "Resume the automation workflow" },
  { command: "workflow_status", description: "Check workflow status" },
  { command: "queue_status", description: "Operations queue status" },
  { command: "jobs_imported", description: "Job import statistics" },
  { command: "applications_today", description: "Today's application count" },
  { command: "recruiters_found", description: "Recruiters discovered" },
  { command: "outreach_status", description: "Outreach generation status" },
  { command: "matching_status", description: "Job matching results" },
  { command: "menu", description: "Main menu with inline buttons" },
  { command: "connect", description: "Connect your Telegram account to the web dashboard" },
  {
    command: "refresh_cookies",
    description: "Check/refresh provider cookies (usage: /refresh_cookies <provider> [new_cookie])",
  },
];

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

function apiUrl(method: string): string {
  return `${TELEGRAM_API_BASE}${getBotToken()}/${method}`;
}

async function callTelegramApi(method: string, body?: Record<string, any>): Promise<any> {
  const url = apiUrl(method);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function registerTelegramCommands(): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await callTelegramApi("setMyCommands", { commands: BOT_COMMANDS });
    if (data.ok) {
      console.log(`[telegram] Registered ${BOT_COMMANDS.length} commands`);
    } else {
      console.warn(`[telegram] Failed to register commands: ${data.description}`);
    }
    return { ok: data.ok ?? false, error: data.description };
  } catch (err: any) {
    console.warn(`[telegram] Command registration error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function registerTelegramWebhook(): Promise<{ ok: boolean; error?: string }> {
  try {
    const publicUrl = process.env.PUBLIC_URL?.trim();
    if (!publicUrl) {
      console.warn("[telegram] PUBLIC_URL not set — skipping webhook registration");
      return { ok: false, error: "PUBLIC_URL not configured" };
    }

    const webhookUrl = `${publicUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
    console.log(`[telegram] Registering webhook: ${webhookUrl}`);

    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    const webhookPayload: Record<string, any> = { url: webhookUrl };
    if (secretToken) webhookPayload.secret_token = secretToken;

    const data = await callTelegramApi("setWebhook", webhookPayload);
    if (data.ok) {
      console.log(`[telegram] Webhook registered: ${webhookUrl}`);
    } else {
      console.warn(`[telegram] Failed to register webhook: ${data.description}`);
    }

    // Verify registration
    const info = await callTelegramApi("getWebhookInfo");
    if (info.ok) {
      console.log(
        `[telegram] Webhook status: url=${info.result.url}, pending=${info.result.pending_update_count || 0}`,
      );
    }

    return { ok: data.ok ?? false, error: data.description };
  } catch (err: any) {
    console.warn(`[telegram] Webhook registration error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

let initialized = false;

export async function initTelegramBot(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    // Always try to register commands (idempotent)
    await registerTelegramCommands();

    // Only register webhook if PUBLIC_URL is set
    const publicUrl = process.env.PUBLIC_URL?.trim();
    if (publicUrl) {
      await registerTelegramWebhook();
    } else {
      console.log(
        "[telegram] PUBLIC_URL not set — webhook auto-registration skipped (local/dev mode)",
      );
    }
  } catch (err: any) {
    console.warn(`[telegram] Initialization error: ${err.message}`);
  }
}
