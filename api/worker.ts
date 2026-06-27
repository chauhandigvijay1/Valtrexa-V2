/**
 * Railway Worker — processes BullMQ queues for browser automation & background jobs.
 *
 * - Detects Railway automatically via RAILWAY_SERVICE_NAME env var.
 * - On Vercel: enqueue work only (no browser execution).
 * - On Railway: execute work (Playwright, browser automation, all background jobs).
 * - Single queue, single execution path, no duplicated logic.
 *
 * Start: npx tsx api/worker.ts
 */

import { Worker } from "bullmq";
import IORedis from "ioredis";

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

  const shutdown = async () => {
    console.log("[worker] Shutting down...");
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
