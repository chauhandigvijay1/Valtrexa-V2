/**
 * A10 — Followup Engine.
 *
 * Implements the Day 3 / Day 7 / Day 14 cadence. When an application is created
 * (or an outreach message is sent) the engine schedules three follow-ups with
 * contextual draft bodies. Due follow-ups are surfaced by `dueFollowups()`.
 *
 * Builds on the existing `followups` table — adds cadence + sequence metadata.
 */

import { supabaseAdmin } from "./supabase.js";
import { emitWorkflowEvent } from "./workflow-events.js";
import { callOpenRouterJson } from "./openrouter.js";

export const CADENCE = [
  {
    day: 3,
    cadence: "day_3",
    sequenceIndex: 0,
    defaultNote: "Day 3 — polite check-in on application review",
  },
  {
    day: 7,
    cadence: "day_7",
    sequenceIndex: 1,
    defaultNote: "Day 7 — reiterate interest + add fresh signal",
  },
  {
    day: 14,
    cadence: "day_14",
    sequenceIndex: 2,
    defaultNote: "Day 14 — final follow-up + alternative contact",
  },
] as const;

const followupSchema = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
} as const;

export type ContextualFollowup = { subject: string; body: string };

/** Schedule the full Day 3/7/14 cadence for an application (idempotent). */
export async function scheduleApplicationCadence(input: {
  userId: string;
  applicationId: string;
  companyName: string;
}): Promise<{ scheduled: number }> {
  let scheduled = 0;
  for (const step of CADENCE) {
    const existing = await supabaseAdmin
      .from("followups")
      .select("id")
      .eq("user_id", input.userId)
      .eq("application_id", input.applicationId)
      .eq("cadence", step.cadence)
      .maybeSingle();
    if (existing.data?.id) continue;

    const dueAt = new Date(Date.now() + step.day * 86400000).toISOString();
    const insert = await supabaseAdmin.from("followups").insert({
      user_id: input.userId,
      application_id: input.applicationId,
      due_at: dueAt,
      note: `${step.defaultNote} — ${input.companyName}`,
      done: false,
      cadence: step.cadence,
      sequence_index: step.sequenceIndex,
    } as any);
    if (!insert.error) scheduled += 1;
  }

  if (scheduled > 0) {
    await emitWorkflowEvent({
      userId: input.userId,
      eventType: "followup_cadence_scheduled",
      entityType: "applications",
      entityId: input.applicationId,
      payload: { companyName: input.companyName, scheduled },
    });
  }
  return { scheduled };
}

/** Schedule a recruiter-specific follow-up cadence (no application required). */
export async function scheduleRecruiterCadence(input: {
  userId: string;
  recruiterId: string;
  companyName: string;
}): Promise<{ scheduled: number }> {
  let scheduled = 0;
  for (const step of CADENCE) {
    const dueAt = new Date(Date.now() + step.day * 86400000).toISOString();
    const insert = await supabaseAdmin.from("followups").insert({
      user_id: input.userId,
      recruiter_id: input.recruiterId,
      due_at: dueAt,
      note: `${step.defaultNote} — ${input.companyName}`,
      done: false,
      cadence: step.cadence,
      sequence_index: step.sequenceIndex,
    } as any);
    if (!insert.error) scheduled += 1;
  }
  return { scheduled };
}

/** Generate a contextual follow-up draft for a due follow-up row. */
export async function generateContextualFollowup(input: {
  userId: string;
  followupId: string;
}): Promise<ContextualFollowup> {
  const followupRow = await supabaseAdmin
    .from("followups")
    .select("*")
    .eq("id", input.followupId)
    .eq("user_id", input.userId)
    .maybeSingle();
  const followup: any = followupRow.data;
  if (!followup) throw new Error("Follow-up not found.");

  const [application, recruiter] = await Promise.all([
    followup.application_id
      ? supabaseAdmin
          .from("applications")
          .select("*")
          .eq("id", followup.application_id)
          .eq("user_id", input.userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    followup.recruiter_id
      ? supabaseAdmin
          .from("recruiters")
          .select("*")
          .eq("id", followup.recruiter_id)
          .eq("user_id", input.userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const cadenceLabel = CADENCE.find((c) => c.cadence === followup.cadence)?.day ?? 0;

  const result = await callOpenRouterJson<ContextualFollowup>(
    [
      {
        role: "system",
        content:
          `Write a Day ${cadenceLabel} follow-up that is contextual and non-repetitive. ` +
          `Acknowledge prior contact, add one fresh signal (insight, project, or news), and end with a light CTA. ` +
          `Return strict JSON {subject, body}.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          cadence: followup.cadence,
          note: followup.note,
          application: application.data,
          recruiter: recruiter.data,
        }),
      },
    ],
    "followup_draft",
    followupSchema,
    { userId: input.userId },
  ).catch(() => ({
    data: {
      subject:
        `Following up — ${(application.data as any)?.role_title ?? "my application"} at ${(application.data as any)?.company_name ?? ""}`.trim(),
      body:
        `Hi ${(recruiter.data as any)?.name ?? "there"},\n\nFollowing up on my application for ${(application.data as any)?.role_title ?? "the role"}. ` +
        `I'd love to share a quick update on a relevant project if helpful.\n\nThanks for your time.`,
    },
    model: "local-fallback:followup",
    usage: null,
    source: "env" as const,
  }));

  await supabaseAdmin
    .from("followups")
    .update({ body: result.data.body } as any)
    .eq("id", input.followupId)
    .eq("user_id", input.userId);

  return result.data;
}

/** Return follow-ups that are due (or overdue) and not yet done. */
export async function dueFollowups(userId: string, limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("followups")
    .select("*")
    .eq("user_id", userId)
    .eq("done", false)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Mark a follow-up as sent (and done). */
export async function markFollowupSent(userId: string, followupId: string) {
  const { data, error } = await supabaseAdmin
    .from("followups")
    .update({ done: true, sent_at: new Date().toISOString() })
    .eq("id", followupId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await emitWorkflowEvent({
    userId,
    eventType: "followup_sent",
    entityType: "followups",
    entityId: followupId,
    payload: { cadence: data.cadence },
  });
  return data;
}
