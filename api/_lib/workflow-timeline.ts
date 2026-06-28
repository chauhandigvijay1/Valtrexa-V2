import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";

export type WorkflowStage = {
  id: string;
  user_id: string;
  cycle_id: string | null;
  stage: string;
  status: "running" | "completed" | "failed" | "skipped";
  label: string | null;
  message: string | null;
  progress: number;
  total: number;
  metadata: Record<string, any>;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function isSchemaCacheErr(e: any) {
  return e?.message?.includes?.("schema cache") ?? false;
}

export async function startStage(
  userId: string,
  stage: string,
  opts?: { cycleId?: string; label?: string; total?: number },
) {
  const { data, error } = await supabaseAdmin
    .from("workflow_timeline")
    .insert({
      user_id: userId,
      cycle_id: opts?.cycleId ?? null,
      stage,
      status: "running",
      label: opts?.label ?? null,
      total: opts?.total ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    if (isSchemaCacheErr(error)) {
      logger.warn(
        `[workflow-timeline] Schema cache stale — can't start stage ${stage}. Run NOTIFY pgrst, 'reload schema' in SQL Editor.`,
      );
      return null;
    }
    logger.error(`[workflow-timeline] Failed to start stage ${stage}:`, error.message);
    return null;
  }
  return data as WorkflowStage;
}

export async function updateStageProgress(stageId: string, progress: number, message?: string) {
  if (!stageId) return;
  const update: Record<string, any> = { progress };
  if (message !== undefined) update.message = message;
  const { error } = await supabaseAdmin.from("workflow_timeline").update(update).eq("id", stageId);
  if (error && !isSchemaCacheErr(error))
    logger.error(`[workflow-timeline] updateStageProgress error:`, error.message);
}

export async function completeStage(
  stageId: string,
  message?: string,
  metadata?: Record<string, any>,
) {
  if (!stageId) return;
  const update: Record<string, any> = {
    status: "completed",
    completed_at: new Date().toISOString(),
  };
  if (message !== undefined) update.message = message;
  if (metadata !== undefined) update.metadata = metadata;
  const { error } = await supabaseAdmin.from("workflow_timeline").update(update).eq("id", stageId);
  if (error && !isSchemaCacheErr(error))
    logger.error(`[workflow-timeline] completeStage error:`, error.message);
}

export async function failStage(stageId: string, errorMsg: string) {
  if (!stageId) return;
  const { error } = await supabaseAdmin
    .from("workflow_timeline")
    .update({ status: "failed", message: errorMsg, completed_at: new Date().toISOString() })
    .eq("id", stageId);
  if (error && !isSchemaCacheErr(error))
    logger.error(`[workflow-timeline] failStage error:`, error.message);
}

export async function getTimeline(userId: string, limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("workflow_timeline")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error && !isSchemaCacheErr(error))
    logger.error(`[workflow-timeline] getTimeline error:`, error.message);
  return (data ?? []) as WorkflowStage[];
}

export async function getLatestStage(userId: string, stage: string) {
  const { data, error } = await supabaseAdmin
    .from("workflow_timeline")
    .select("*")
    .eq("user_id", userId)
    .eq("stage", stage)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && !isSchemaCacheErr(error))
    logger.error(`[workflow-timeline] getLatestStage error:`, error.message);
  return data as WorkflowStage | null;
}

export async function getRunningStage(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workflow_timeline")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && !isSchemaCacheErr(error))
    logger.error(`[workflow-timeline] getRunningStage error:`, error.message);
  return data as WorkflowStage | null;
}

export async function cancelRunningStages(userId: string) {
  const { error } = await supabaseAdmin
    .from("workflow_timeline")
    .update({
      status: "failed",
      message: "Workflow cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "running");
  if (error && !isSchemaCacheErr(error))
    logger.error(`[workflow-timeline] cancelRunningStages error:`, error.message);
}
