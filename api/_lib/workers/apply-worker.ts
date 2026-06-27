import {
  buildApplicationPackage,
  submitApplication,
  submitApprovedApplication,
} from "../apply-engine.js";
import { applyWithPlaywright, recordPlaywrightApplyResult } from "../playwright-apply.js";

export type ApplyPayload = {
  userId: string;
  applicationId: string;
  jobId: string;
  companyName: string;
};

export type PlaywrightApplyPayload = {
  userId: string;
  applicationId: string;
  jobId: string;
  jobUrl: string;
  provider: string;
  companyName?: string;
  approvalMode?: boolean;
};

export async function applyInline(payload: ApplyPayload) {
  await buildApplicationPackage({
    userId: payload.userId,
    jobId: payload.jobId,
    applicationId: payload.applicationId,
    companyName: payload.companyName,
  });
  return submitApplication({
    userId: payload.userId,
    applicationId: payload.applicationId,
    jobId: payload.jobId,
  });
}

export async function playwrightApplyInline(payload: PlaywrightApplyPayload) {
  const [resume, brain] = await Promise.all([
    import("../apply-engine.js").then((m) => m.resolvePrimaryResume(payload.userId)),
    import("../candidate-brain.js").then((m) => m.getCandidateBrain(payload.userId)),
  ]);

  const pwResult = await applyWithPlaywright({
    userId: payload.userId,
    applicationId: payload.applicationId,
    jobId: payload.jobId,
    jobUrl: payload.jobUrl,
    provider: payload.provider as any,
    candidateData: { ...(brain ?? { profile: {}, baseProfile: {} }), resumeUrl: resume?.resumeId },
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    approvalMode: payload.approvalMode ?? false,
  });

  await recordPlaywrightApplyResult({
    userId: payload.userId,
    applicationId: payload.applicationId,
    provider: payload.provider,
    result: pwResult,
  });

  return pwResult;
}
