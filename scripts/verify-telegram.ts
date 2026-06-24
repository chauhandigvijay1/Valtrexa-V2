import { config } from "dotenv";
config({ path: ".env" });
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}

async function main() {
  // Verify commands are registered
  const r1 = await fetch(`https://api.telegram.org/bot${TOKEN}/getMyCommands`);
  const cmds = await r1.json();
  console.log("=== COMMANDS ===");
  if (cmds.ok && cmds.result) {
    console.log(`Registered: ${cmds.result.length} commands`);
    for (const c of cmds.result) {
      console.log(`  /${c.command} - ${c.description}`);
    }
  } else {
    console.log("Failed to get commands:", cmds.description);
  }

  // Verify webhook status
  const r2 = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
  const info = await r2.json();
  console.log("\n=== WEBHOOK ===");
  console.log(`URL: ${info.result?.url || "(not set)"}`);
  console.log(`Pending updates: ${info.result?.pending_update_count || 0}`);

  // Send test message
  const r3 = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: 1155286195,
      text: "<b>E2E TEST</b>\nTelegram notification: ✅ working\nCommands: ✅ registered",
      parse_mode: "HTML",
    }),
  });
  const sent = await r3.json();
  console.log("\n=== SEND TEST ===");
  console.log(`Sent: ${sent.ok ? "✅" : "❌"} ${sent.description || ""}`);
  if (sent.result) {
    console.log(`Message ID: ${sent.result.message_id}`);
  }
}

main().catch((e) => console.error("Error:", e.message));
