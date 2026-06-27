/**
 * Railway Worker — processes BullMQ queues for browser automation & background jobs.
 *
 * - Detects Railway automatically via RAILWAY_SERVICE_NAME env var.
 * - On Vercel: enqueue work only (no browser execution).
 * - On Railway: execute work (Playwright, browser automation, all background jobs).
 * - Single queue, single execution path, no duplicated logic.
 *
 * Start: tsx api/worker.ts
 */

import { Worker } from "bullmq";
import IORedis from "ioredis";
import { supabaseAdmin } from "./_lib/supabase.js";

const isRailway = !!(
  process.env.RAILWAY_SERVICE_NAME ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_ENVIRONMENT_NAME
);

const REDIS_URL = process.env.REDIS_URL ?? process.env.REDISCLOUD_URL ?? "redis://localhost:6379";

async function createRedisConnection(): Promise<IORedis> {
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 5000,
    retryStrategy: (times) => Math.min(times * 100, 5000),
  });
  await conn.connect();
  return conn;
}

interface QueueConfig {
  processor: (data: Record<string, unknown>) => Promise<unknown>;
  concurrency?: number;
}

async function loadProcessors(): Promise<Record<string, QueueConfig>> {
  const [
    applyWorker,
    jobWorker,
    recruiterWorker,
    outreachWorker,
    followupWorker,
    gmailWorker,
    analyticsWorker,
  ] = await Promise.all([
    import("./_lib/workers/apply-worker.js"),
    import("./_lib/workers/job-worker.js"),
    import("./_lib/workers/recruiter-worker.js"),
    import("./_lib/workers/outreach-worker.js"),
    import("./_lib/workers/followup-worker.js"),
    import("./_lib/workers/gmail-worker.js"),
    import("./_lib/workers/analytics-worker.js"),
  ]);

  return {
    apply: {
      processor: async (data) => {
        const { playwrightApplyInline } = applyWorker;
        return playwrightApplyInline(data as any);
      },
      concurrency: 2,
    },
    "job-import": {
      processor: async (data) => {
        const { importJobsInline } = jobWorker;
        return importJobsInline(data as any);
      },
    },
    recruiter: {
      processor: async (data) => {
        const { discoverRecruitersInline } = recruiterWorker;
        return discoverRecruitersInline(data as any);
      },
    },
    outreach: {
      processor: async (data) => {
        const { generateOutreachInline } = outreachWorker;
        return generateOutreachInline(data as any);
      },
    },
    followup: {
      processor: async (data) => {
        const { processFollowupsInline } = followupWorker;
        return processFollowupsInline(data as any);
      },
    },
    gmail: {
      processor: async (data) => {
        const { syncGmailInline } = gmailWorker;
        return syncGmailInline(data as any);
      },
    },
    analytics: {
      processor: async (data) => {
        const { runAnalyticsInline } = analyticsWorker;
        return runAnalyticsInline(data as any);
      },
    },
  };
}

const QUEUE_NAMES = [
  "job-import",
  "apply",
  "recruiter",
  "outreach",
  "followup",
  "gmail",
  "analytics",
] as const;

async function start(): Promise<void> {
  if (!isRailway) {
    console.log("[worker] Not on Railway — skipping worker startup");
    process.exit(0);
  }

  console.log("[worker] Starting Railway worker...");
  const connection = await createRedisConnection();
  console.log("[worker] Connected to Redis");

  const processors = await loadProcessors();
  const workers: Worker[] = [];

  for (const name of QUEUE_NAMES) {
    const config = processors[name];
    if (!config) {
      console.warn(`[worker] No processor for queue "${name}" — skipping`);
      continue;
    }

    const worker = new Worker(
      name,
      async (job) => {
        console.log(`[worker] Processing ${name}/${job.name} (id=${job.id})`);
        const start = Date.now();
        try {
          const result = await config.processor(job.data);
          const duration = Date.now() - start;
          console.log(`[worker] Completed ${name}/${job.name} in ${duration}ms`);
          return result;
        } catch (err: any) {
          const duration = Date.now() - start;
          console.error(`[worker] Failed ${name}/${job.name} after ${duration}ms:`, err?.message);
          throw err;
        }
      },
      {
        connection: connection.duplicate() as any,
        concurrency: config.concurrency ?? 1,
      },
    );

    worker.on("failed", (job, err) => {
      console.error(`[worker] BullMQ failed ${name}/${job?.name}:`, err?.message);
    });

    worker.on("error", (err) => {
      console.error(`[worker] BullMQ error on ${name}:`, err?.message);
    });

    workers.push(worker);
    console.log(`[worker] Listening on queue "${name}" (concurrency=${config.concurrency ?? 1})`);
  }

  console.log(`[worker] All ${workers.length} queues active. Waiting for jobs...`);

  let cycleTimer: ReturnType<typeof setInterval> | null = null;
  let cycleRunning = false;

  async function runScheduledCycle(): Promise<void> {
    if (cycleRunning) {
      console.log("[worker] Previous cycle still running — skipping");
      return;
    }
    cycleRunning = true;
    const startedAt = Date.now();
    try {
      const { data: activeUsers, error } = await supabaseAdmin
        .from("workflow_state")
        .select("user_id")
        .not("user_id", "is", null)
        .eq("status", "running");

      if (error) {
        console.error(`[worker] Failed to query active users: ${error.message}`);
        return;
      }

      if (!activeUsers || activeUsers.length === 0) {
        console.log("[worker] No active workflows found — skipping cycle");
        return;
      }

      console.log(`[worker] Running cycle for ${activeUsers.length} active user(s)`);
      const { runCycle } = await import("./_lib/workflow-runner.js");

      for (const row of activeUsers) {
        if (!row.user_id) continue;
        try {
          const result = await runCycle(row.user_id);
          const elapsed = Date.now() - startedAt;
          console.log(`[worker] User ${row.user_id} cycle: ${result.status} (${elapsed}ms)`);
        } catch (err: any) {
          console.error(`[worker] User ${row.user_id} cycle failed: ${err?.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[worker] Scheduled cycle error: ${err?.message}`);
    } finally {
      cycleRunning = false;
      console.log(`[worker] Cycle finished (${Date.now() - startedAt}ms)`);
    }
  }

  setTimeout(() => runScheduledCycle(), 10_000);
  cycleTimer = setInterval(() => runScheduledCycle(), 30 * 60 * 1000);
  console.log("[worker] Scheduled workflow cycle every 30 minutes");

  const shutdown = async () => {
    console.log("[worker] Shutting down...");
    if (cycleTimer) clearInterval(cycleTimer);
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
