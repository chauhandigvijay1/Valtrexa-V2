import { google } from "googleapis";
import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry.js";

function getGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail OAuth not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.",
    );
  }
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GMAIL_REDIRECT_URI ?? "http://localhost",
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function buildRfc2822Message(to: string, subject: string, body: string): string {
  const lines = [
    `From: me`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(body).toString("base64"),
  ];
  return lines.join("\r\n");
}

function encodeEmail(rfc2822: string): string {
  return Buffer.from(rfc2822, "utf-8").toString("base64url");
}

export async function sendOutreachMessage(outreachId: string): Promise<boolean> {
  const { data: msg, error } = await supabaseAdmin
    .from("outreach_messages")
    .select("*")
    .eq("id", outreachId)
    .single();

  if (error || !msg) {
    logger.error("Outreach message not found", { id: outreachId, error: error?.message });
    return false;
  }

  if (msg.status !== "draft") {
    logger.warn("Outreach message not in draft status", { id: outreachId, status: msg.status });
    return false;
  }

  if (
    msg.kind !== "cold_email" &&
    msg.kind !== "hiring_manager_outreach" &&
    msg.kind !== "founder_outreach"
  ) {
    logger.warn("Outreach kind is not email, skipping Gmail send", {
      id: outreachId,
      kind: msg.kind,
    });
    return false;
  }

  const { data: recruiter } = await supabaseAdmin
    .from("recruiters")
    .select("email, name, company_name")
    .eq("id", msg.recruiter_id)
    .maybeSingle();

  const toEmail = recruiter?.email;
  if (!toEmail) {
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "failed", error_message: "No recruiter email" })
      .eq("id", outreachId);
    return false;
  }

  try {
    await withRetry(
      async () => {
        const gmail = getGmailClient();
        const raw = encodeEmail(
          buildRfc2822Message(
            toEmail,
            `${recruiter?.name ? `Hi ${recruiter.name.split(" ")[0]}, ` : ""}${msg.subject}`,
            msg.body,
          ),
        );
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      },
      { attempts: 3, baseDelayMs: 2000 },
    );

    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", outreachId);
    logger.info("Outreach sent via Gmail", { id: outreachId, to: toEmail, kind: msg.kind });
    return true;
  } catch (err: any) {
    await supabaseAdmin
      .from("outreach_messages")
      .update({ status: "failed", error_message: err.message })
      .eq("id", outreachId);
    logger.error("Failed to send outreach", { id: outreachId, to: toEmail, error: err.message });
    return false;
  }
}

export async function sendPendingOutreaches(limit = 10): Promise<{ sent: number; failed: number }> {
  const { data: drafts, error } = await supabaseAdmin
    .from("outreach_messages")
    .select("id")
    .eq("status", "draft")
    .in("kind", ["cold_email", "hiring_manager_outreach", "founder_outreach"])
    .limit(limit);

  if (error || !drafts?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const draft of drafts) {
    const ok = await sendOutreachMessage(draft.id);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
