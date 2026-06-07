import { listWebhookSubscriptionsCompat } from "./compat.js";
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

  // Follow-Up Engine
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

  const subscriptionsResult = await listWebhookSubscriptionsCompat(input.userId);
  const subscriptions = (subscriptionsResult.data ?? []).filter(
    (subscription: any) => subscription.event_type === input.eventType && subscription.enabled,
  );

  let delivered = 0;

  for (const subscription of subscriptions ?? []) {
    try {
      const response = await fetch(subscription.target_url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(subscription.secret ? { "x-career-compass-secret": subscription.secret } : {}),
        },
        body: JSON.stringify({
          eventType: input.eventType,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          userId: input.userId,
          payload: input.payload,
          occurredAt: new Date().toISOString(),
        }),
      });
      if (response.ok) delivered += 1;
    } catch {
      // Keep the event in the queue even if a push attempt fails.
    }
  }

  return { persisted: true, delivered, error: null };
}
