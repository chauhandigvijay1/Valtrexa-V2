/**
 * A9 — Outreach Engine.
 *
 * Generates recruiter email, LinkedIn message, and founder outreach drafts.
 * Every draft is personalized from research + pain points + candidate profile.
 * Builds on the existing `outreach_messages` storage (no duplicate service).
 */

import { supabaseAdmin } from "./supabase.js";
import { callOpenRouterJson } from "./openrouter.js";
import { emitWorkflowEvent } from "./workflow-events.js";
import { getLatestResumeParseCompat } from "./compat.js";
import { fallbackOutreach } from "./ai-fallbacks.js";

export type OutreachKind =
  | "cold_email"
  | "linkedin_message"
  | "hiring_manager_outreach"
  | "founder_outreach";

const outreachSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
} as const;

export async function generateOutreachDraft(input: {
  userId: string;
  kind: OutreachKind;
  companyName: string;
  recruiterId?: string;
  resumeId: string;
  painPointIds?: string[];
}): Promise<{ id: string; subject: string; body: string; kind: OutreachKind }> {
  const [resumeParse, painPoints, recruiter] = await Promise.all([
    getLatestResumeParseCompat(input.userId, input.resumeId),
    input.painPointIds?.length
      ? supabaseAdmin
          .from("painpoints")
          .select("*")
          .eq("user_id", input.userId)
          .in("id", input.painPointIds)
      : supabaseAdmin
          .from("painpoints")
          .select("*")
          .eq("user_id", input.userId)
          .eq("company_name", input.companyName)
          .limit(5),
    input.recruiterId
      ? supabaseAdmin
          .from("recruiters")
          .select("*")
          .eq("user_id", input.userId)
          .eq("id", input.recruiterId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!resumeParse) throw new Error("Resume parse not found. Upload and parse a resume first.");

  const systemPrompt = buildSystemPrompt(input.kind);
  const userPayload = {
    kind: input.kind,
    companyName: input.companyName,
    recruiter: recruiter.data,
    resume: resumeParse.parsed_data,
    painPoints: painPoints.data ?? [],
  };

  const result = await callOpenRouterJson<{ subject: string; body: string }>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    "outreach_message_v2",
    outreachSchema,
    { userId: input.userId },
  ).catch(() => ({
    data: fallbackOutreach({
      type: input.kind,
      companyName: input.companyName,
      recruiter: recruiter.data as any,
      resume: resumeParse.parsed_data as any,
      painPoints: (painPoints.data ?? []) as any,
    }),
    model: "local-fallback:outreach",
    usage: null,
    source: "env" as const,
  }));

  const insert = await supabaseAdmin
    .from("outreach_messages")
    .insert({
      user_id: input.userId,
      recruiter_id: input.recruiterId ?? null,
      subject: result.data.subject,
      body: result.data.body,
      status: "draft",
      kind: input.kind,
      company_name: input.companyName,
      pain_points: (painPoints.data ?? []).map((p: any) => p.title),
      generated_context: { recruiter: recruiter.data, painPointIds: input.painPointIds ?? [] },
    } as any)
    .select("*")
    .single();
  if (insert.error) throw new Error(insert.error.message);

  await emitWorkflowEvent({
    userId: input.userId,
    eventType: "outreach_generated",
    entityType: "outreach_messages",
    entityId: insert.data.id,
    payload: {
      companyName: input.companyName,
      kind: input.kind,
      recruiterId: input.recruiterId ?? null,
    },
  });

  return {
    id: insert.data.id,
    subject: result.data.subject,
    body: result.data.body,
    kind: input.kind,
  };
}

function buildSystemPrompt(kind: OutreachKind): string {
  switch (kind) {
    case "founder_outreach":
      return (
        "Write a concise, founder-targeted outreach grounded in the candidate profile, research, and pain points. " +
        "Lead with a specific insight about the company's product or market, then connect it to one concrete outcome the candidate can deliver. " +
        "Avoid fluff. Return strict JSON {subject, body}."
      );
    case "hiring_manager_outreach":
      return (
        "Write a hiring-manager outreach grounded in the candidate's most relevant project and the team's pain points. " +
        "Be specific about how the candidate's work maps to the role. Return strict JSON {subject, body}."
      );
    case "linkedin_message":
      return (
        "Write a short LinkedIn connection message (under 300 chars) personalized to the recruiter and company. " +
        "No generic templates. Return strict JSON {subject, body}."
      );
    case "cold_email":
    default:
      return (
        "Write a concise cold email grounded in the candidate profile and company pain points. " +
        "Avoid generic fluff. Return strict JSON {subject, body}."
      );
  }
}
