import { config } from "dotenv";
config({ path: ".env" });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}
const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

const COMMANDS = [
  { command: "health", description: "System health check" },
  { command: "status", description: "Dashboard summary" },
  { command: "jobs", description: "Recent 10 job imports" },
  { command: "applications", description: "Recent 10 applications" },
  { command: "recruiters", description: "Discovered recruiters" },
  { command: "interviews", description: "Upcoming interviews" },
  { command: "analytics", description: "System analytics" },
  { command: "approvals", description: "Pending approvals" },
  { command: "highvalue", description: "High value companies" },
  { command: "followups", description: "Overdue follow-ups" },
];

async function registerCommands() {
  console.log("Registering commands...");
  const res = await fetch(`${API_BASE}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands: COMMANDS }),
  });
  const data = await res.json();
  console.log("setMyCommands response:", JSON.stringify(data, null, 2));
}

async function setWebhook(url: string) {
  console.log(`Setting webhook to: ${url}`);
  const res = await fetch(`${API_BASE}/setWebhook?url=${encodeURIComponent(url)}`);
  const data = await res.json();
  console.log("setWebhook response:", JSON.stringify(data, null, 2));
}

async function getWebhookInfo() {
  const res = await fetch(`${API_BASE}/getWebhookInfo`);
  return res.json();
}

async function getUpdates() {
  const res = await fetch(`${API_BASE}/getUpdates`);
  const data = await res.json();
  console.log("Pending updates:", data?.result?.length || 0);
  return data;
}

async function main() {
  // Step 1: Register commands
  await registerCommands();

  // Step 2: Show current webhook info
  console.log("\n--- Current webhook ---");
  const info = await getWebhookInfo();
  console.log(JSON.stringify(info, null, 2));

  // Step 3: Check pending updates
  console.log("\n--- Checking pending updates ---");
  const updates = await getUpdates();
  if (updates?.result?.length > 0) {
    console.log(`Getting ${updates.result.length} pending updates...`);
    // Process each update
    for (const update of updates.result) {
      console.log(
        `  Update ${update.update_id}:`,
        update.message?.text || update.callback_query?.data || "(non-text)",
        "from chat:",
        update.message?.chat?.id || update.callback_query?.message?.chat?.id,
      );
    }
  }
}

main().catch((e) => console.error("Error:", e.message));
