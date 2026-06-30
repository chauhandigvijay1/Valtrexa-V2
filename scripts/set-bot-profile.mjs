import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ Set TELEGRAM_BOT_TOKEN env var first");
  process.exit(1);
}

const pngPath = resolve(__dirname, "..", "public", "bot-profile.png");
const photo = readFileSync(pngPath);

const form = new FormData();
form.append("photo", new Blob([photo], { type: "image/png" }), "bot-profile.png");

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyPhoto`, {
  method: "POST",
  body: form,
});

const data = await res.json();
if (data.ok) {
  console.log("✅ Bot profile photo set successfully!");
} else {
  console.error("❌ Failed:", data.description);
}
