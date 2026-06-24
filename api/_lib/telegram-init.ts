const TELEGRAM_API_BASE = `https://api.telegram.org/bot`;

const BOT_COMMANDS = [
  { command: "health", description: "System health check" },
  { command: "status", description: "Dashboard summary (jobs, apps, interviews)" },
  { command: "jobs", description: "Recent 10 job imports" },
  { command: "applications", description: "Recent 10 applications" },
  { command: "recruiters", description: "Discovered recruiters" },
  { command: "interviews", description: "Upcoming interviews" },
  { command: "analytics", description: "System analytics" },
  { command: "approvals", description: "Pending approvals" },
  { command: "highvalue", description: "High value companies" },
  { command: "followups", description: "Overdue follow-ups" },
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

    const data = await callTelegramApi("setWebhook", { url: webhookUrl });
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
