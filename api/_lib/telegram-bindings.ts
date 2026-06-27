/**
 * Telegram account binding — multi-user self-service connection.
 *
 * Each authenticated user generates a one-time token from the web UI,
 * then sends it to the Telegram bot via /connect <token>.
 * The bot validates the token and stores the binding permanently.
 */

import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage, sendTelegramKeyboard } from "./telegram.js";
import { logger } from "./logger.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BINDING_TOKEN_EXPIRY_MINUTES = 15;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "ValtrexaV2Bot";

export async function generateBindingToken(userId: string): Promise<{
  token: string;
  deepLink: string;
  expiresAt: string;
}> {
  // Invalidate any existing unused tokens
  await supabase
    .from("telegram_binding_tokens")
    .update({ used: true })
    .eq("user_id", userId)
    .eq("used", false);

  const token = crypto.randomUUID().replace(/-/g, "").substring(0, 24);
  const expiresAt = new Date(Date.now() + BINDING_TOKEN_EXPIRY_MINUTES * 60000).toISOString();

  const { error } = await supabase.from("telegram_binding_tokens").insert({
    user_id: userId,
    token,
    expires_at: expiresAt,
  });

  if (error) {
    logger.error("Failed to create binding token", { userId, error: error.message });
    throw new Error("Failed to generate binding token");
  }

  return {
    token,
    deepLink: `https://t.me/${BOT_USERNAME}?start=connect_${token}`,
    expiresAt,
  };
}

export async function validateBindingToken(
  token: string,
): Promise<{ valid: boolean; userId?: string; tokenRowId?: string; error?: string }> {
  const { data, error } = await supabase
    .from("telegram_binding_tokens")
    .select("id, user_id, expires_at, used")
    .eq("token", token)
    .single();

  if (error || !data) {
    return { valid: false, error: "Invalid token." };
  }

  if (data.used) {
    return {
      valid: false,
      error: "Token has already been used. Generate a new one from Settings.",
    };
  }

  if (new Date(data.expires_at) < new Date()) {
    return { valid: false, error: "Token has expired. Generate a new one from Settings." };
  }

  return { valid: true, userId: data.user_id, tokenRowId: data.id };
}

export async function bindTelegramAccount(
  userId: string,
  tokenId: string,
  telegramUserId: number,
  chatId: number,
  username?: string,
  firstName?: string,
): Promise<{ ok: boolean; error?: string }> {
  // Mark token as used
  await supabase.from("telegram_binding_tokens").update({ used: true }).eq("id", tokenId);

  // Upsert binding
  const { error } = await supabase.from("telegram_bindings").upsert(
    {
      user_id: userId,
      telegram_user_id: telegramUserId,
      chat_id: chatId,
      username: username ?? null,
      first_name: firstName ?? null,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: "user_id", ignoreDuplicates: false },
  );

  if (error) {
    logger.error("Failed to bind Telegram", { userId, error: error.message });
    return { ok: false, error: error.message };
  }

  logger.info("Telegram account bound", { userId, telegramUserId });
  return { ok: true };
}

export async function getChatIdForUser(userId: string): Promise<number | null> {
  const { data } = await supabase
    .from("telegram_bindings")
    .select("chat_id")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.chat_id ?? null;
}

export async function getUserIdByTelegramId(telegramUserId: number): Promise<string | null> {
  const { data } = await supabase
    .from("telegram_bindings")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  return data?.user_id ?? null;
}

export async function getUserIdByChatId(chatId: number): Promise<string | null> {
  const { data } = await supabase
    .from("telegram_bindings")
    .select("user_id")
    .eq("chat_id", chatId)
    .maybeSingle();

  return data?.user_id ?? null;
}

export async function unbindTelegramAccount(userId: string): Promise<boolean> {
  const { error } = await supabase.from("telegram_bindings").delete().eq("user_id", userId);

  if (error) {
    logger.error("Failed to unbind Telegram", { userId, error: error.message });
    return false;
  }
  return true;
}

export async function sendUserNotification(
  userId: string,
  text: string,
  buttons?: Array<Array<{ text: string; callback_data: string }>>,
): Promise<boolean> {
  const chatId = await getChatIdForUser(userId);
  if (!chatId) {
    logger.warn("No Telegram binding for user", { userId });
    return false;
  }

  if (buttons) {
    const result = await sendTelegramKeyboard(chatId, text, buttons);
    return result.ok;
  }
  const result = await sendTelegramMessage(chatId, text);
  return result.ok;
}

export async function sendWelcomeMessage(chatId: number, firstName: string): Promise<void> {
  const welcomeText = `<b>🎉 Welcome to VALTREXA-V2, ${escapeTelegram(firstName)}!</b>

Your AI Career Operating System is now connected.

<b>Quick Start:</b>
• /start — Show this menu
• /status — Dashboard summary
• /providers — Provider status
• /workflow — Workflow controls
• /help — All commands

<b>Next Steps:</b>
1. Upload your resume from the web dashboard
2. Complete your Candidate Brain profile
3. Configure provider cookies
4. Press /workflow_start to begin automation

Need help? Visit the web dashboard${process.env.PUBLIC_URL ? ` at <a href="${process.env.PUBLIC_URL}">VALTREXA-V2</a>` : "."}`;

  await sendTelegramKeyboard(chatId, welcomeText, [
    [
      { text: "📊 Status", callback_data: "menu:status" },
      { text: "🔧 Providers", callback_data: "menu:providers" },
    ],
    [
      { text: "▶️ Start Workflow", callback_data: "menu:workflow_start" },
      { text: "❓ Help", callback_data: "menu:help" },
    ],
  ]);
}

function escapeTelegram(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
