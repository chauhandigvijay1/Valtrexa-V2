import { supabaseAdmin } from "./supabase.js";
import { sendTelegramMessage } from "./telegram.js";
import { getChatIdForUser } from "./telegram-bindings.js";
import { logger } from "./logger.js";

export type NotificationCategory =
  | "application_approval"
  | "outreach_approval"
  | "cookie_expiry"
  | "provider_failure"
  | "workflow_state"
  | "error"
  | "warning"
  | "health_alert"
  | "queue_event";

export type NotificationInput = {
  userId: string;
  category: NotificationCategory;
  title: string;
  message?: string;
  severity?: "info" | "warning" | "error" | "success";
  link?: string;
  metadata?: Record<string, any>;
};

function isSchemaCacheErr(e: any) {
  return e?.message?.includes?.("schema cache") ?? false;
}

export async function createNotification(input: NotificationInput) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .insert({
      user_id: input.userId,
      category: input.category,
      title: input.title,
      message: input.message ?? null,
      severity: input.severity ?? "info",
      link: input.link ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    if (isSchemaCacheErr(error)) {
      logger.warn(
        `[notifications] Schema cache stale — notification will be delayed. Run NOTIFY pgrst, 'reload schema' in SQL Editor.`,
      );
    } else {
      logger.error(`[notifications] Failed to create: ${error.message}`);
    }
    return null;
  }

  try {
    const chatId = await getChatIdForUser(input.userId);
    if (chatId) {
      const emoji =
        input.severity === "error"
          ? "❌"
          : input.severity === "warning"
            ? "⚠️"
            : input.severity === "success"
              ? "✅"
              : "ℹ️";
      let text = `${emoji} <b>${escapeHtml(input.title)}</b>\n`;
      if (input.message) text += escapeHtml(input.message) + "\n";
      if (input.link) text += `\n<a href="${input.link}">View in dashboard →</a>`;
      await sendTelegramMessage(chatId, text);
    }
  } catch (e: any) {
    logger.error(`[notifications] Telegram mirror failed: ${e.message}`);
  }

  return data;
}

export async function markRead(notificationId: string, userId: string) {
  await supabaseAdmin
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);
}

export async function markAllRead(userId: string) {
  await supabaseAdmin
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("read", false);
}

export async function getNotifications(
  userId: string,
  opts?: { unreadOnly?: boolean; limit?: number; category?: NotificationCategory },
) {
  let query = supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);

  if (opts?.unreadOnly) query = query.eq("read", false);
  if (opts?.category) query = query.eq("category", opts.category);

  const { data } = await query;
  return (data ?? []) as any[];
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  return count ?? 0;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
