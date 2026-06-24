import { dueFollowups, generateContextualFollowup, markFollowupSent } from "../followup-engine.js";

export type FollowupPayload = {
  userId: string;
  limit?: number;
};

/** Process all due follow-ups: generate contextual drafts + mark sent. */
export async function processFollowupsInline(payload: FollowupPayload) {
  const due = await dueFollowups(payload.userId, payload.limit ?? 50);
  const processed: any[] = [];
  for (const followup of due) {
    try {
      const draft = await generateContextualFollowup({
        userId: payload.userId,
        followupId: (followup as any).id,
      });
      await markFollowupSent(payload.userId, (followup as any).id);
      processed.push({ id: (followup as any).id, subject: draft.subject, sent: true });
    } catch (err: any) {
      processed.push({ id: (followup as any).id, sent: false, error: err?.message });
    }
  }
  return { processed: processed.length, items: processed };
}
