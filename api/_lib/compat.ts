import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";

const META_PREFIX = "__ccp_meta__:";

type ResumeVersionMeta = {
  storagePath?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  parseStatus?: string | null;
};

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isMissingSchemaError(error?: { message?: string } | null) {
  const message = error?.message ?? "";
  return /schema cache|relation .* does not exist|column .* does not exist|Could not find the table|Could not find the '.*' column/i.test(
    message,
  );
}

export function encodeMeta(meta: Record<string, unknown>) {
  return `${META_PREFIX}${JSON.stringify(meta)}`;
}

export function decodeMeta(text?: string | null) {
  if (!text?.startsWith(META_PREFIX)) return {};
  try {
    const parsed = JSON.parse(text.slice(META_PREFIX.length));
    return isObject(parsed) ? parsed : {};
  } catch (err) {
    logger.warn("[Compat] decodeMeta JSON parse failed", err);
    return {};
  }
}

export function normalizeResumeVersion(version: any) {
  const meta = decodeMeta(version?.notes);
  return {
    ...version,
    storage_path: version?.storage_path ?? meta.storagePath ?? version?.file_url ?? null,
    file_name: version?.file_name ?? meta.fileName ?? null,
    file_type: version?.file_type ?? meta.fileType ?? null,
    file_size_bytes: version?.file_size_bytes ?? meta.fileSizeBytes ?? null,
    parse_status:
      version?.parse_status ?? meta.parseStatus ?? (version?.content ? "completed" : "pending"),
    parsed_text: version?.parsed_text ?? version?.content ?? "",
  };
}

export async function insertResumeVersionCompat(input: {
  resumeId: string;
  userId: string;
  version: number;
  storagePath: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  rawText: string;
}) {
  const richInsert = await supabaseAdmin
    .from("resume_versions")
    .insert({
      resume_id: input.resumeId,
      user_id: input.userId,
      version: input.version,
      storage_path: input.storagePath,
      file_name: input.fileName,
      file_type: input.fileType,
      file_size_bytes: input.fileSizeBytes,
      file_url: input.storagePath,
      parsed_text: input.rawText,
      parse_status: "completed",
    } as any)
    .select("*")
    .single();

  if (!richInsert.error || !isMissingSchemaError(richInsert.error)) {
    return richInsert;
  }

  return supabaseAdmin
    .from("resume_versions")
    .insert({
      resume_id: input.resumeId,
      user_id: input.userId,
      version: input.version,
      file_url: input.storagePath,
      content: input.rawText,
      notes: encodeMeta({
        storagePath: input.storagePath,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSizeBytes: input.fileSizeBytes,
        parseStatus: "completed",
      } satisfies ResumeVersionMeta),
    })
    .select("*")
    .single();
}

export async function insertResumeParseCompat(input: {
  userId: string;
  resumeId: string;
  resumeVersionId: string;
  rawText: string;
  parsed: Record<string, any>;
  model?: string | null;
  usage?: any;
}) {
  const richPayload = {
    user_id: input.userId,
    resume_id: input.resumeId,
    resume_version_id: input.resumeVersionId,
    raw_text: input.rawText,
    full_name: input.parsed.name ?? null,
    email: input.parsed.email ?? null,
    phone: input.parsed.phone ?? null,
    confidence_score: input.parsed.confidence_score ?? null,
    skills: input.parsed.skills ?? [],
    experience: input.parsed.experience ?? [],
    projects: input.parsed.projects ?? [],
    education: input.parsed.education ?? [],
    certifications: input.parsed.certifications ?? [],
    parser_version: input.model ?? "unknown",
    parsed_data: input.parsed,
  } as any;

  const richInsert = await supabaseAdmin.from("resume_parses").insert(richPayload);
  if (!richInsert.error || !isMissingSchemaError(richInsert.error)) {
    return { error: richInsert.error, persistedTable: !richInsert.error };
  }

  const { confidence_score: _confidenceScore, ...fallbackPayload } = richPayload;
  const fallbackInsert = await supabaseAdmin.from("resume_parses").insert(fallbackPayload);
  return { error: fallbackInsert.error, persistedTable: !fallbackInsert.error };
}

export async function getLatestResumeParseCompat(userId: string, resumeId: string) {
  const direct = await supabaseAdmin
    .from("resume_parses")
    .select("*")
    .eq("user_id", userId)
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!direct.error && direct.data) return direct.data;
  return null;
}

export async function insertDailySummaryCompat(input: {
  userId: string;
  summaryDate: string;
  summaryText: string;
  payload: Record<string, unknown>;
}) {
  const direct = await supabaseAdmin
    .from("daily_summaries" as any)
    .upsert(
      {
        user_id: input.userId,
        summary_date: input.summaryDate,
        summary_text: input.summaryText,
        payload: input.payload,
      },
      { onConflict: "user_id,summary_date" },
    )
    .select("*")
    .single();

  if (!direct.error || !isMissingSchemaError(direct.error)) return direct;

  const fallback = await supabaseAdmin
    .from("analytics_events")
    .insert({
      user_id: input.userId,
      event_name: "daily_summary",
      properties: {
        summary_date: input.summaryDate,
        summary_text: input.summaryText,
        payload: input.payload,
      },
    })
    .select("*")
    .single();

  return {
    data: fallback.data
      ? {
          id: fallback.data.id,
          user_id: input.userId,
          summary_date: input.summaryDate,
          summary_text: input.summaryText,
          payload: input.payload,
          created_at: fallback.data.created_at,
        }
      : null,
    error: fallback.error,
  };
}

export async function listWorkflowEventsCompat(userId: string, since?: string | null, limit = 50) {
  let direct = supabaseAdmin
    .from("workflow_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (since) direct = direct.gte("created_at", since);
  return direct;
}
