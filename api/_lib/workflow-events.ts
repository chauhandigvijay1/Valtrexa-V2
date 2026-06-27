import { supabaseAdmin } from "./supabase.js";

export async function emitWorkflowEvent(input: {
  userId: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
}) {
  const insertResult = await supabaseAdmin.from("workflow_events").insert({
    user_id: input.userId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    payload: input.payload,
  });

  if (input.eventType === "application_created" && input.entityId) {
    const days = [3, 7, 14];
    const now = new Date();
    for (const d of days) {
      const due = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
      await supabaseAdmin.from("followups").insert({
        user_id: input.userId,
        application_id: input.entityId,
        due_at: due.toISOString(),
        done: false,
        note: `Day ${d} automated follow-up check`,
      } as any);
    }
  }

  if (insertResult.error) {
    return {
      persisted: false,
      delivered: 0,
      error:
        insertResult.error instanceof Error
          ? insertResult.error.message
          : String(insertResult.error),
    };
  }

  return { persisted: true, delivered: 0, error: null };
}
