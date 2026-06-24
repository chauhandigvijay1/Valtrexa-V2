import { supabaseAdmin } from "../supabase.js";
import { insertDailySummaryCompat } from "../compat.js";

export type AnalyticsPayload = {
  userId: string;
};

export async function runAnalyticsInline(payload: AnalyticsPayload) {
  const [applications, interviews] = await Promise.all([
    supabaseAdmin.from("applications").select("id,status").eq("user_id", payload.userId),
    supabaseAdmin.from("interviews").select("id,status").eq("user_id", payload.userId),
  ]);
  const appRows = applications.data ?? [];
  const interviewRows = interviews.data ?? [];
  const total = appRows.length;
  const offers = appRows.filter((r: any) => r.status === "offer" || r.status === "accepted").length;
  const rejections = appRows.filter((r: any) => r.status === "rejected").length;
  const responses = appRows.filter((r: any) => !["saved", "applied"].includes(r.status)).length;

  const summaryPayload = {
    applications: total,
    interviews: interviewRows.length,
    offers,
    rejections,
    responseRate: total ? Math.round((responses / total) * 100) : 0,
    interviewRate: total ? Math.round((interviewRows.length / total) * 100) : 0,
  };

  const upsert = await insertDailySummaryCompat({
    userId: payload.userId,
    summaryDate: new Date().toISOString().slice(0, 10),
    summaryText: [
      `Applications: ${summaryPayload.applications}`,
      `Interviews: ${summaryPayload.interviews}`,
      `Offers: ${summaryPayload.offers}`,
      `Rejections: ${summaryPayload.rejections}`,
      `Response rate: ${summaryPayload.responseRate}%`,
      `Interview rate: ${summaryPayload.interviewRate}%`,
    ].join("\n"),
    payload: summaryPayload as any,
  });
  return { summary: summaryPayload, persisted: !!upsert.data };
}
