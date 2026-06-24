import { generateOutreachDraft, type OutreachKind } from "../outreach-engine.js";

export type OutreachPayload = {
  userId: string;
  kind: OutreachKind;
  companyName: string;
  recruiterId?: string;
  resumeId: string;
  painPointIds?: string[];
};

export async function generateOutreachInline(payload: OutreachPayload) {
  return generateOutreachDraft(payload);
}
