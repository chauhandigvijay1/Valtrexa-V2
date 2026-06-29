/**
 * A11 — Inbox Intelligence.
 *
 * Gmail OAuth + classification of incoming mail into:
 *   interview | assessment | offer | rejection | recruiter_reply | other
 *
 * - OAuth uses GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN from env.
 * - Classified messages are stored in `inbox_messages`.
 * - When a classification maps to a known application/recruiter, those FKs are linked.
 * - Events are emitted so the analytics + telegram layers can react.
 */

import { google } from "googleapis";
import { supabaseAdmin } from "./supabase.js";
import { emitWorkflowEvent } from "./workflow-events.js";
import { logger } from "./logger.js";

export type InboxClassification =
  "interview" | "assessment" | "offer" | "rejection" | "recruiter_reply" | "other";

export type ClassifiedMessage = {
  messageId: string;
  threadId: string | null;
  fromAddress: string;
  toAddress: string;
  subject: string;
  snippet: string;
  body: string;
  classification: InboxClassification;
  confidence: number;
  classificationReason: string;
  companyName: string | null;
  receivedAt: string | null;
};

function lower(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase() : "";
}

const PATTERNS: Array<{ kind: InboxClassification; weight: number; re: RegExp; reason: string }> = [
  {
    kind: "interview",
    weight: 3,
    re: /(interview|technical screen|virtual onsite|meet the team|hiring manager call|panel interview)/i,
    reason: "interview keywords",
  },
  {
    kind: "interview",
    weight: 2,
    re: /(calendar invite|google meet|zoom\.us|teams\.microsoft|schedule.*call)/i,
    reason: "scheduling link",
  },
  {
    kind: "assessment",
    weight: 3,
    re: /(assessment|hackerank|hackerrank|codility|codesignal|karat|interviewing\.io|take.?home|test link|aptitude test)/i,
    reason: "assessment platform",
  },
  {
    kind: "offer",
    weight: 3,
    re: /(pleased to offer|congratulations.*offer|offer letter|compensation package|we.?d like to extend an offer)/i,
    reason: "offer language",
  },
  {
    kind: "rejection",
    weight: 3,
    re: /(regret to inform|not moving forward|not be progressing|decided not to|other candidates|your application.*unsuccessful|thank you for applying.*unfortunately)/i,
    reason: "rejection language",
  },
  {
    kind: "recruiter_reply",
    weight: 2,
    re: /(thanks for reaching out|good to hear from you|let's connect|happy to chat|appreciate your interest)/i,
    reason: "recruiter reply",
  },
  {
    kind: "recruiter_reply",
    weight: 1,
    re: /(recruiter|talent acquisition|sourcer|people ops)/i,
    reason: "recruiter domain",
  },
];

export function classifyMessage(input: { subject: string; body: string; fromAddress: string }): {
  classification: InboxClassification;
  confidence: number;
  reason: string;
} {
  const text = `${input.subject}\n${input.body}\n${input.fromAddress}`;
  const scores: Record<InboxClassification, number> = {
    interview: 0,
    assessment: 0,
    offer: 0,
    rejection: 0,
    recruiter_reply: 0,
    other: 0,
  };
  const reasons: Record<InboxClassification, string[]> = {
    interview: [],
    assessment: [],
    offer: [],
    rejection: [],
    recruiter_reply: [],
    other: [],
  };
  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) {
      scores[pattern.kind] += pattern.weight;
      reasons[pattern.kind].push(pattern.reason);
    }
  }
  let best: InboxClassification = "other";
  let bestScore = 0;
  (Object.keys(scores) as InboxClassification[]).forEach((k) => {
    if (scores[k] > bestScore) {
      bestScore = scores[k];
      best = k;
    }
  });
  if (bestScore === 0)
    return { classification: "other", confidence: 0.3, reason: "no signal matched" };
  // confidence scales with hit weight, capped at 0.97
  const confidence = Math.min(0.97, 0.5 + bestScore * 0.12);
  return {
    classification: best,
    confidence: Number(confidence.toFixed(2)),
    reason: reasons[best].join(", "),
  };
}

function extractCompany(subject: string, body: string, fromAddress: string): string | null {
  // Try "from <company>" / "at <company>" in the subject first, then the sender domain.
  const m = subject.match(/(?:at|from|@)\s*([A-Z][A-Za-z0-9&.'-]{2,40})/);
  if (m && !/(gmail|outlook|yahoo|indeed|linkedin|noreply)/i.test(m[1])) return m[1];
  const domain = (fromAddress.split("@")[1] ?? "").toLowerCase();
  const cleaned = domain.split(".").slice(-2, -1)[0];
  if (cleaned && !/(gmail|outlook|yahoo|hotmail|aol|icloud)/.test(cleaned)) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return null;
}

/** Resolve an OAuth2 client from env-stored refresh token. */
function getGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail OAuth not configured (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN).",
    );
  }
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GMAIL_REDIRECT_URI ??
      (() => {
        throw new Error("GMAIL_REDIRECT_URI environment variable is required for Gmail OAuth");
      })(),
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function decodePayload(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  if (Array.isArray(payload.parts)) {
    const textPart = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    const htmlPart = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, "base64url")
        .toString("utf-8")
        .replace(/<[^>]+>/g, " ");
    }
  }
  return "";
}

export async function syncInboxForUser(
  userId: string,
  maxResults = 25,
): Promise<{ synced: number; classified: ClassifiedMessage[] }> {
  const gmail = getGmailClient();
  const list = await gmail.users.messages.list({ userId: "me", maxResults, q: "newer_than:7d" });
  const messageIds = (list.data.messages ?? []).map((m) => String(m.id));
  const classified: ClassifiedMessage[] = [];

  for (const id of messageIds) {
    // Isolate per-message processing: one failure should not abort remaining messages.
    try {
      const existing = await supabaseAdmin
        .from("inbox_messages")
        .select("id")
        .eq("user_id", userId)
        .eq("message_id", id)
        .maybeSingle();
      if (existing.data?.id) continue;

      const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const headers = (msg.data.payload?.headers ?? []) as Array<{ name?: string; value?: string }>;
      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
      const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
      const to = headers.find((h) => h.name?.toLowerCase() === "to")?.value ?? "";
      const body = decodePayload(msg.data.payload).slice(0, 8000);
      const snippet = (msg.data.snippet ?? "").slice(0, 500);
      const receivedAt = msg.data.internalDate
        ? new Date(Number(msg.data.internalDate)).toISOString()
        : null;

      const { classification, confidence, reason } = classifyMessage({
        subject,
        body,
        fromAddress: from,
      });
      const companyName = extractCompany(subject, body, from);

      const record: ClassifiedMessage = {
        messageId: id,
        threadId: msg.data.threadId ? String(msg.data.threadId) : null,
        fromAddress: from,
        toAddress: to,
        subject,
        snippet,
        body,
        classification,
        confidence,
        classificationReason: reason,
        companyName,
        receivedAt,
      };
      classified.push(record);

      // Link to application/recruiter when possible.
      let applicationId: string | null = null;
      let recruiterId: string | null = null;
      if (companyName) {
        const appMatch = await supabaseAdmin
          .from("applications")
          .select("id")
          .eq("user_id", userId)
          .ilike("company_name", `%${companyName}%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        applicationId = appMatch.data?.id ?? null;
        const recMatch = await supabaseAdmin
          .from("recruiters")
          .select("id")
          .eq("user_id", userId)
          .ilike("company", `%${companyName}%`)
          .limit(1)
          .maybeSingle();
        recruiterId = recMatch.data?.id ?? null;
      }

      const messagePayload = {
        user_id: userId,
        message_id: id,
        thread_id: record.threadId,
        from_address: from,
        to_address: to,
        subject,
        snippet,
        body,
        classification,
        confidence,
        classification_reason: reason,
        company_name: companyName,
        application_id: applicationId,
        recruiter_id: recruiterId,
        received_at: receivedAt,
        processed_at: new Date().toISOString(),
      } as const;

      await supabaseAdmin.from("inbox_messages").insert(messagePayload as any);

      await supabaseAdmin
        .from("gmail_messages")
        .insert({ ...messagePayload, updated_at: new Date().toISOString() } as any);

      if (confidence >= 0.7) {
        await autoCreateDownstream(
          userId,
          classification,
          companyName,
          applicationId,
          subject,
          body,
        );
      }

      await emitWorkflowEvent({
        userId,
        eventType: `inbox_${classification}`,
        entityType: "inbox_messages",
        payload: { messageId: id, subject, companyName, applicationId },
      });
    } catch (msgErr: any) {
      logger.warn("[inbox-intelligence] Failed to process message", {
        messageId: id,
        userId,
        error: msgErr.message,
      });
    }
  }

  return { synced: classified.length, classified };
}

async function autoCreateDownstream(
  userId: string,
  classification: InboxClassification,
  companyName: string | null,
  applicationId: string | null,
  subject: string,
  body: string,
) {
  if (classification === "interview" && companyName) {
    // Create or update an interview record.
    await supabaseAdmin.from("interviews").upsert(
      {
        user_id: userId,
        application_id: applicationId,
        company_name: companyName,
        role_title: "Detected from inbox",
        status: "scheduled",
        notes: `Auto-detected from email: ${subject}`,
      } as any,
      { onConflict: "user_id,company_name,role_title" },
    );
  }
  if (classification === "assessment" && companyName) {
    await supabaseAdmin.from("assessments").insert({
      user_id: userId,
      application_id: applicationId,
      title: subject.slice(0, 200),
      type: "online",
      status: "pending",
      notes: body.slice(0, 1000),
    } as any);
  }
  if (classification === "offer" && applicationId) {
    await supabaseAdmin
      .from("applications")
      .update({ status: "offer" })
      .eq("id", applicationId)
      .eq("user_id", userId);
  }
  if (classification === "rejection" && applicationId) {
    await supabaseAdmin
      .from("applications")
      .update({ status: "rejected" })
      .eq("id", applicationId)
      .eq("user_id", userId);
  }
}
