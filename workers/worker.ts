import { config } from "dotenv";
import type { Job } from "bullmq";
import type { QueueName } from "../api/_lib/queue.js";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const { Worker } = await import("bullmq");
const { getConnection, QUEUE_NAMES } = await import("../api/_lib/queue.js");
const { importJobsInline } = await import("../api/_lib/workers/job-worker.js");
const { applyInline, playwrightApplyInline } = await import("../api/_lib/workers/apply-worker.js");
const { discoverRecruitersInline } = await import("../api/_lib/workers/recruiter-worker.js");
const { generateOutreachInline } = await import("../api/_lib/workers/outreach-worker.js");
const { processFollowupsInline } = await import("../api/_lib/workers/followup-worker.js");
const { syncGmailInline } = await import("../api/_lib/workers/gmail-worker.js");
const { runAnalyticsInline } = await import("../api/_lib/workers/analytics-worker.js");

export const HANDLERS: Record<QueueName, (job: Job) => Promise<unknown>> = {
  "job-import": async (job) => importJobsInline(job.data as any),
  apply: async (job) => {
    if (job.name === "playwright-apply") {
      return playwrightApplyInline(job.data as any);
    }
    return applyInline(job.data as any);
  },
  recruiter: async (job) => discoverRecruitersInline(job.data as any),
  outreach: async (job) => generateOutreachInline(job.data as any),
  followup: async (job) => processFollowupsInline(job.data as any),
  gmail: async (job) => syncGmailInline(job.data as any),
  analytics: async (job) => runAnalyticsInline(job.data as any),
};

export async function startWorkers(queues: QueueName[] = [...QUEUE_NAMES]) {
  const connection = await getConnection();
  if (!connection) {
    throw new Error(
      "Redis unavailable — workers cannot start. The API still works in inline mode.",
    );
  }
  const workers = queues.map(
    (name) =>
      new Worker(
        name,
        async (job) => {
          try {
            return await HANDLERS[name](job);
          } catch (err) {
            console.error(`[worker:${name}] job ${job.id} failed:`, err);
            throw err;
          }
        },
        { connection: connection.duplicate() as unknown as any, concurrency: 4 },
      ),
  );
  console.log(`[workers] started: ${queues.join(", ")}`);
  return workers;
}

const args = process.argv.slice(2);
const queues = args.length
  ? (args.filter((q) => (QUEUE_NAMES as readonly string[]).includes(q)) as QueueName[])
  : [...QUEUE_NAMES];

if (queues.length) {
  startWorkers(queues).catch((err) => {
    console.error("[workers] fatal:", err);
    process.exit(1);
  });
}
