import { supabaseAdmin } from "./supabase.js";

export type WorkflowStatus = "running" | "paused" | "stopped" | "error";

export interface WorkflowState {
  id: string;
  status: WorkflowStatus;
  started_at: string | null;
  stopped_at: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  started_by: string | null;
  stopped_by: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

function api() {
  return supabaseAdmin.from("workflow_state");
}

export async function getWorkflowState(userId: string): Promise<WorkflowState | null> {
  const { data, error } = await api().select("*").eq("user_id", userId).limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function startWorkflow(userId: string, by?: string): Promise<WorkflowState> {
  const now = new Date().toISOString();
  // Try to update from stopped first
  const { data, error } = await api()
    .update({
      status: "running",
      started_at: now,
      resumed_at: now,
      stopped_at: null,
      paused_at: null,
      started_by: by ?? null,
      stopped_by: null,
      error: null,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("status", "stopped")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  // Try to update from paused
  const { data: d2, error: e2 } = await api()
    .update({
      status: "running",
      resumed_at: now,
      paused_at: null,
      error: null,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("status", "paused")
    .select()
    .maybeSingle();
  if (e2) throw e2;
  if (d2) return d2;

  // If already running, return it
  const { data: running } = await api()
    .select("status")
    .eq("user_id", userId)
    .eq("status", "running")
    .maybeSingle();
  if (running) throw new Error("Workflow is already running");

  // No existing row — create one
  const { data: created, error: e3 } = await api()
    .insert({
      user_id: userId,
      status: "running",
      started_at: now,
      resumed_at: now,
      started_by: by ?? null,
      updated_at: now,
    })
    .select()
    .maybeSingle();
  if (e3) throw e3;
  if (!created) throw new Error("Failed to create workflow state");
  return created;
}

export async function stopWorkflow(userId: string, by?: string): Promise<WorkflowState> {
  const now = new Date().toISOString();
  const { data, error } = await api()
    .update({
      status: "stopped",
      stopped_at: now,
      stopped_by: by ?? null,
      paused_at: null,
      updated_at: now,
    })
    .eq("user_id", userId)
    .in("status", ["running", "paused"])
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Workflow is already stopped");
  return data;
}

export async function pauseWorkflow(userId: string, by?: string): Promise<WorkflowState> {
  const now = new Date().toISOString();
  const { data, error } = await api()
    .update({
      status: "paused",
      paused_at: now,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("status", "running")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Workflow is not running");
  return data;
}

export async function resumeWorkflow(userId: string, by?: string): Promise<WorkflowState> {
  const now = new Date().toISOString();
  const { data, error } = await api()
    .update({
      status: "running",
      resumed_at: now,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("status", "paused")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Workflow is not paused");
  return data;
}

export async function isWorkflowActive(userId: string): Promise<boolean> {
  const state = await getWorkflowState(userId);
  return state?.status === "running";
}
