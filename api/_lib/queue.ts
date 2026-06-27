/**
 * B2 — Redis + BullMQ Queue Registry.
 *
 * Defines the seven queues required by the platform:
 *   job-import | apply | recruiter | outreach | followup | gmail | analytics
 *
 * Redis connection is read from REDIS_URL (falls back to local default).
 * When Redis is not reachable, every queue degrades to an in-process executor
 * so the API still works in serverless / no-Redis deployments. The DB mirror
 * table `queue_jobs` keeps an audit trail visible from the UI regardless.
 */

import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { supabaseAdmin } from "./supabase.js";

export const QUEUE_NAMES = [
  "job-import",
  "apply",
  "recruiter",
  "outreach",
  "followup",
  "gmail",
  "analytics",
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

let _connection: IORedis | null = null;
let _available: boolean | null = null;
const _queues = new Map<QueueName, Queue>();

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? process.env.REDISCLOUD_URL ?? "redis://localhost:6379";
}

/** Lazy singleton Redis connection. Returns null if Redis is unreachable. */
export async function getConnection(): Promise<IORedis | null> {
  if (_available === false) return null;
  if (_connection) return _connection;
  try {
    const conn = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 2000,
      retryStrategy: () => null,
    });
    await conn.connect();
    _connection = conn;
    _available = true;
    return conn;
  } catch {
    _available = false;
    return null;
  }
}

export async function isQueueAvailable(): Promise<boolean> {
  const conn = await getConnection();
  return !!conn;
}

export async function getQueue(name: QueueName): Promise<Queue | null> {
  const conn = await getConnection();
  if (!conn) return null;
  if (_queues.has(name)) return _queues.get(name)!;
  // bullmq vendors its own ioredis typings; cast through unknown to avoid the
  // dual-package type mismatch between the hoisted ioredis and bullmq's copy.
  const queue = new Queue(name, { connection: conn.duplicate() as unknown as any });
  _queues.set(name, queue);
  return queue;
}

export async function getQueueEvents(name: QueueName): Promise<QueueEvents | null> {
  const conn = await getConnection();
  if (!conn) return null;
  return new QueueEvents(name, { connection: conn.duplicate() as unknown as any });
}

/** Enqueue a job. Falls back to immediate in-process execution if Redis is down. */
export async function enqueue<T = unknown>(
  queueName: QueueName,
  jobName: string,
  data: Record<string, unknown>,
  options?: {
    userId: string;
    delayMs?: number;
    attempts?: number;
    runInline?: (data: Record<string, unknown>) => Promise<T>;
  },
): Promise<{ mode: "redis" | "inline" | "db-only"; jobId: string | null; result?: T }> {
  const auditId = await recordQueueJob(queueName, jobName, data, options?.userId ?? "");

  const queue = await getQueue(queueName);
  if (queue) {
    const job = await queue.add(jobName, data, {
      delay: options?.delayMs,
      attempts: options?.attempts ?? 3,
      backoff: { type: "exponential", delay: 2000 },
    });
    await updateQueueJobStatus(auditId, "queued", { jobId: job.id ?? undefined }, options?.userId);
    return { mode: "redis", jobId: job.id ?? null };
  }

  // Redis unavailable — run inline if a handler was supplied, else DB-only.
  if (options?.runInline) {
    await updateQueueJobStatus(auditId, "active", {}, options?.userId);
    try {
      const result = await options.runInline(data);
      await updateQueueJobStatus(auditId, "completed", { result }, options?.userId);
      return { mode: "inline", jobId: auditId, result };
    } catch (err: any) {
      await updateQueueJobStatus(
        auditId,
        "failed",
        { error: err?.message ?? String(err) },
        options?.userId,
      );
      throw err;
    }
  }

  await updateQueueJobStatus(auditId, "queued", {}, options?.userId);
  return { mode: "db-only", jobId: auditId };
}

async function recordQueueJob(
  queueName: QueueName,
  jobName: string,
  data: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const { data: row, error } = await supabaseAdmin
    .from("queue_jobs")
    .insert({
      user_id: userId,
      queue_name: queueName,
      payload: { jobName, ...data },
      status: "queued",
    } as any)
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to record queue job.");
  return row.id as string;
}

export async function updateQueueJobStatus(
  auditId: string,
  status: string,
  patch: { jobId?: string; result?: unknown; error?: string },
  userId?: string,
) {
  const payload: Record<string, unknown> = { status };
  if (patch.jobId) payload.job_id = patch.jobId;
  if (patch.result !== undefined) payload.result = patch.result as any;
  if (patch.error) payload.error_message = patch.error;
  let query = supabaseAdmin
    .from("queue_jobs")
    .update(payload as any)
    .eq("id", auditId);
  if (userId) query = query.eq("user_id", userId);
  await query;
}

/** Human-readable queue stats (counts by status) — for the UI dashboard. */
export async function queueStats(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("queue_jobs")
    .select("queue_name,status")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const stats: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    const q = (row as any).queue_name;
    const s = (row as any).status;
    stats[q] ??= {};
    stats[q][s] = (stats[q][s] ?? 0) + 1;
  }
  return { redisAvailable: await isQueueAvailable(), stats };
}
