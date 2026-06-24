import { syncInboxForUser } from "../inbox-intelligence.js";

export type GmailPayload = {
  userId: string;
  maxResults?: number;
};

export async function syncGmailInline(payload: GmailPayload) {
  return syncInboxForUser(payload.userId, payload.maxResults ?? 25);
}
