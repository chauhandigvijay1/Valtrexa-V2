import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";

export type ProviderStatus = "enabled" | "disabled" | "paused" | "maintenance";
export type ProviderName = "linkedin" | "indeed" | "naukri" | "wellfound" | "instahyre";

export const PROVIDERS: ProviderName[] = ["linkedin", "indeed", "naukri", "wellfound", "instahyre"];

export interface ProviderControl {
  id: string;
  provider: ProviderName;
  status: ProviderStatus;
  failure_count: number;
  consecutive_failures: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  last_success_at: string | null;
  disabled_by: string | null;
  disabled_at: string | null;
  auto_disabled: boolean;
  auto_recovery_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderHealthEvent {
  provider: ProviderName;
  event_type:
    | "failure"
    | "recovery"
    | "disabled"
    | "enabled"
    | "paused"
    | "resumed"
    | "maintenance"
    | "warning"
    | "info";
  severity: "critical" | "warning" | "info";
  message: string;
  details?: Record<string, unknown>;
}

// ─── DB Helpers ───────────────────────────────────────────

function api(): any {
  return supabaseAdmin.from("provider_controls");
}

function healthApi(): any {
  return supabaseAdmin.from("provider_health_log");
}

// ─── Read ─────────────────────────────────────────────────

export async function getProviderControls(userId: string): Promise<ProviderControl[]> {
  const { data, error } = await api().select("*").eq("user_id", userId).order("provider");
  if (error) throw error;
  return data ?? [];
}

export async function getProviderControl(
  provider: ProviderName,
  userId: string,
): Promise<ProviderControl | null> {
  const { data, error } = await api()
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

export async function isProviderEnabled(provider: ProviderName, userId: string): Promise<boolean> {
  const control = await getProviderControl(provider, userId);
  return control?.status === "enabled";
}

export async function isProviderAvailable(
  provider: ProviderName,
  userId: string,
): Promise<boolean> {
  const control = await getProviderControl(provider, userId);
  return (
    control?.status === "enabled" ||
    (control?.status === "maintenance" && control?.auto_recovery_at
      ? new Date(control.auto_recovery_at) > new Date()
      : false)
  );
}

// ─── Mutations ────────────────────────────────────────────

export async function setProviderStatus(
  provider: ProviderName,
  status: ProviderStatus,
  userId: string,
  by?: string,
): Promise<ProviderControl> {
  const updates: Record<string, any> = { status, updated_at: new Date().toISOString() };
  if (status === "disabled") {
    updates.disabled_by = by ?? "manual";
    updates.disabled_at = new Date().toISOString();
    updates.auto_disabled = false;
  }
  if (status === "enabled") {
    updates.disabled_by = null;
    updates.disabled_at = null;
    updates.auto_disabled = false;
    updates.consecutive_failures = 0;
  }
  const { data, error } = await api()
    .update(updates)
    .eq("user_id", userId)
    .eq("provider", provider)
    .select()
    .single();
  if (error) throw error;
  await logHealthEvent(
    {
      provider,
      event_type:
        status === "disabled"
          ? "disabled"
          : status === "paused"
            ? "paused"
            : status === "maintenance"
              ? "maintenance"
              : "enabled",
      severity: status === "disabled" ? "critical" : "info",
      message: `Provider ${provider} ${status}${by ? ` by ${by}` : ""}`,
      details: { action: status, actor: by },
    },
    userId,
  );
  return data!;
}

export async function recordProviderSuccess(provider: ProviderName, userId: string): Promise<void> {
  const { error } = await api()
    .update({
      consecutive_failures: 0,
      last_success_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
}

export async function recordProviderFailure(
  provider: ProviderName,
  reason: string,
  userId: string,
  autoDisableThreshold = 3,
): Promise<void> {
  const control = await getProviderControl(provider, userId);
  if (!control) return;

  const consecutive = (control.consecutive_failures ?? 0) + 1;
  const updates: Record<string, any> = {
    failure_count: (control.failure_count ?? 0) + 1,
    consecutive_failures: consecutive,
    last_failure_at: new Date().toISOString(),
    last_failure_reason: reason,
    updated_at: new Date().toISOString(),
  };

  if (consecutive >= autoDisableThreshold && control.status === "enabled") {
    updates.status = "disabled";
    updates.disabled_by = "auto";
    updates.disabled_at = new Date().toISOString();
    updates.auto_disabled = true;
  }

  const { error } = await api().update(updates).eq("user_id", userId).eq("provider", provider);
  if (error) throw error;

  const eventType = consecutive >= autoDisableThreshold ? "disabled" : "failure";
  await logHealthEvent(
    {
      provider,
      event_type: eventType as any,
      severity: consecutive >= autoDisableThreshold ? "critical" : "warning",
      message: reason,
      details: {
        consecutive_failures: consecutive,
        threshold: autoDisableThreshold,
        auto_disabled: consecutive >= autoDisableThreshold,
      },
    },
    userId,
  );
}

// ─── Health Logging ───────────────────────────────────────

export async function logHealthEvent(event: ProviderHealthEvent, userId: string): Promise<void> {
  const { error } = await healthApi().insert({
    provider: event.provider,
    event_type: event.event_type,
    severity: event.severity,
    message: event.message,
    details: event.details ?? {},
    user_id: userId,
  });
  if (error) logger.error("Failed to log health event:", error);
}

export async function getHealthLog(
  userId: string,
  provider?: ProviderName,
  limit = 50,
): Promise<any[]> {
  let query = healthApi()
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (provider) query = query.eq("provider", provider);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── Bulk Operations ──────────────────────────────────────

export async function enableAllProviders(userId: string): Promise<number> {
  let count = 0;
  for (const p of PROVIDERS) {
    await setProviderStatus(p, "enabled", userId, "bulk");
    count++;
  }
  return count;
}

export async function disableAllProviders(userId: string): Promise<number> {
  let count = 0;
  for (const p of PROVIDERS) {
    await setProviderStatus(p, "disabled", userId, "bulk");
    count++;
  }
  return count;
}
