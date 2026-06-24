/**
 * B4 — Event Bus.
 *
 * The publisher (`emitWorkflowEvent` in workflow-events.ts) already persists to
 * `workflow_events` and fires webhook subscriptions. This module adds:
 *
 *   - consumer registry: register named consumers (workers, telegram, n8n)
 *   - delivery history: every delivery attempt is recorded in
 *     `workflow_event_deliveries` so the UI can show per-consumer status
 *   - replay: re-deliver an event to a specific consumer
 *
 * No duplicate publisher — this wraps and extends the existing one.
 */

import { supabaseAdmin } from "./supabase.js";
import { listWebhookSubscriptionsCompat } from "./compat.js";
import { sendTelegramMessage } from "./telegram.js";

export type ConsumerType = "webhook" | "telegram" | "n8n" | "worker";

export type RegisteredConsumer = {
  name: string;
  type: ConsumerType;
  target: string; // webhook url, telegram chat id, worker queue name
  eventTypes: string[]; // empty = all events
  secret?: string | null;
};

/** Register or update a consumer for a user. */
export async function registerConsumer(
  userId: string,
  consumer: RegisteredConsumer,
): Promise<{ registered: boolean }> {
  // Webhook consumers are stored in n8n_webhook_subscriptions (existing table).
  // Other consumers are stored as integrations config for visibility.
  if (consumer.type === "webhook" || consumer.type === "n8n") {
    for (const eventType of consumer.eventTypes.length ? consumer.eventTypes : ["*"]) {
      const existing = await supabaseAdmin
        .from("n8n_webhook_subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("target_url", consumer.target)
        .eq("event_type", eventType)
        .maybeSingle();
      if (existing.data?.id) continue;
      const { error } = await supabaseAdmin.from("n8n_webhook_subscriptions").insert({
        user_id: userId,
        event_type: eventType,
        target_url: consumer.target,
        secret: consumer.secret ?? null,
        enabled: true,
      } as any);
      if (error) throw new Error(error.message);
    }
    return { registered: true };
  }

  // Non-webhook consumers (telegram / worker) — store in integrations.
  const { error } = await supabaseAdmin.from("integrations").upsert(
    {
      user_id: userId,
      provider: `event_consumer:${consumer.type}:${consumer.name}`,
      enabled: true,
      config: {
        type: consumer.type,
        name: consumer.name,
        target: consumer.target,
        event_types: consumer.eventTypes,
      } as any,
    } as any,
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(error.message);
  return { registered: true };
}

/** List all consumers registered for a user (webhooks + integrations). */
export async function listConsumers(userId: string): Promise<RegisteredConsumer[]> {
  const [webhooks, integrations] = await Promise.all([
    listWebhookSubscriptionsCompat(userId),
    supabaseAdmin
      .from("integrations")
      .select("provider,config,enabled")
      .eq("user_id", userId)
      .like("provider", "event_consumer:%"),
  ]);

  const consumers: RegisteredConsumer[] = [];
  for (const row of webhooks.data ?? []) {
    consumers.push({
      name: `webhook:${(row as any).event_type}`,
      type: "webhook",
      target: (row as any).target_url,
      eventTypes: [(row as any).event_type],
      secret: (row as any).secret ?? null,
    });
  }
  for (const row of integrations.data ?? []) {
    const config = ((row as any).config ?? {}) as Record<string, unknown>;
    consumers.push({
      name: String(config.name ?? (row as any).provider),
      type: (config.type as ConsumerType) ?? "worker",
      target: String(config.target ?? ""),
      eventTypes: (config.event_types as string[]) ?? [],
    });
  }
  return consumers;
}

/** Deliver an event to a single consumer and record the outcome. */
export async function deliverToConsumer(
  userId: string,
  eventId: string,
  consumer: RegisteredConsumer,
  payload: Record<string, unknown>,
): Promise<{ status: "delivered" | "failed"; statusCode?: number }> {
  let status: "delivered" | "failed" = "failed";
  let statusCode: number | undefined;
  let snippet = "";

  try {
    if (consumer.type === "webhook" || consumer.type === "n8n") {
      const response = await fetch(consumer.target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(consumer.secret ? { "x-valtrexa-v2-secret": consumer.secret } : {}),
        },
        body: JSON.stringify({ userId, eventId, payload, occurredAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
      });
      statusCode = response.status;
      status = response.ok ? "delivered" : "failed";
      snippet = (await response.text()).slice(0, 500);
    } else if (consumer.type === "telegram") {
      const result = await sendTelegramMessage(
        consumer.target,
        JSON.stringify(payload).slice(0, 2000),
      );
      status = result.ok ? "delivered" : "failed";
      snippet = result.ok ? "telegram message sent" : `telegram failed: ${result.error}`;
    } else {
      status = "delivered";
      snippet = "worker consumer";
    }
  } catch (err: any) {
    status = "failed";
    snippet = err?.message ?? String(err);
  }

  await supabaseAdmin.from("workflow_event_deliveries").insert({
    event_id: eventId,
    user_id: userId,
    consumer: consumer.target,
    status,
    status_code: statusCode ?? null,
    response_snippet: snippet,
    delivered_at: status === "delivered" ? new Date().toISOString() : null,
  } as any);

  return { status, statusCode };
}

/** Replay an event to all its consumers. */
export async function replayEvent(
  userId: string,
  eventId: string,
): Promise<{ deliveries: number }> {
  const { data: event, error } = await supabaseAdmin
    .from("workflow_events")
    .select("*")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !event) throw new Error("Event not found.");

  const consumers = await listConsumers(userId);
  const eventType = (event as any).event_type;
  const matched = consumers.filter(
    (c) => !c.eventTypes.length || c.eventTypes.includes(eventType) || c.eventTypes.includes("*"),
  );

  let deliveries = 0;
  for (const consumer of matched) {
    const result = await deliverToConsumer(userId, eventId, consumer, (event as any).payload ?? {});
    if (result.status === "delivered") deliveries += 1;
  }

  await supabaseAdmin
    .from("workflow_events")
    .update({
      delivered: deliveries > 0,
      delivered_count: deliveries,
      consumer_count: matched.length,
    })
    .eq("id", eventId);

  return { deliveries };
}

/** Delivery history for an event (for the UI). */
export async function deliveryHistory(userId: string, eventId: string) {
  const { data, error } = await supabaseAdmin
    .from("workflow_event_deliveries")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
