import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { PAGE_SIZE } from "@/components/crud-shell";
import { apiPost } from "@/lib/api-client";

type TableName =
  | "projects"
  | "skills"
  | "resumes"
  | "jobs"
  | "applications"
  | "recruiters"
  | "outreach_campaigns"
  | "interviews"
  | "candidate_memory"
  | "recruiter_conversations"
  | "followups"
  | "assessments"
  | "painpoints"
  | "company_research"
  | "learning_loop"
  | "job_matches"
  | "interview_preparation"
  | "outreach_messages"
  | "resume_parses"
  | "resume_analyses"
  | "tailored_resumes"
  | "workflow_events"
  | "n8n_webhook_subscriptions"
  | "job_import_runs"
  | "companies"
  | "candidate_profiles"
  | "education"
  | "experiences";

const WORKFLOW_EVENT_BY_TABLE: Partial<Record<TableName, string>> = {
  recruiters: "recruiter_added",
  interviews: "interview_added",
  assessments: "assessment_added",
};

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return /column .* does not exist|Could not find the '.*' column/i.test(message);
}

function stripUnsupportedColumns(table: TableName, payload: Record<string, unknown>) {
  if (table === "jobs") {
    const {
      normalized_roles: _normalizedRoles,
      experience_level: _experienceLevel,
      work_mode: _workMode,
      salary_min: _salaryMin,
      salary_max: _salaryMax,
      company_size: _companySize,
      freshness_bucket: _freshnessBucket,
      easy_apply: _easyApply,
      ...fallback
    } = payload;
    return fallback;
  }

  if (table === "projects") {
    const { features: _features, ...fallback } = payload;
    return fallback;
  }

  return payload;
}

export function useCrudList<T extends { id: string }>(opts: {
  table: TableName;
  searchColumn: string;
  search: string;
  page: number;
  orderBy?: string;
  ascending?: boolean;
  extraFilter?: (q: any) => any;
  select?: string;
}) {
  const { user } = useAuth();
  const key = [opts.table, opts.search, opts.page, opts.orderBy ?? "created_at"];
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      let q: any = supabase
        .from(opts.table as any)
        .select(opts.select ?? "*", { count: "exact" })
        .order(opts.orderBy ?? "created_at", { ascending: opts.ascending ?? false });
      if (opts.search) q = q.ilike(opts.searchColumn, `%${opts.search}%`);
      if (opts.extraFilter) q = opts.extraFilter(q);
      const from = (opts.page - 1) * PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as T[], count: count ?? 0 };
    },
  });
  return { ...query, queryKey: key };
}

export function useCrudSave<T extends { id?: string }>(table: TableName, queryKeyPrefix: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: T) => {
      if (!user) throw new Error("Not signed in");
      const { id, ...rest } = payload as any;
      if (id) {
        const initial = await supabase
          .from(table as any)
          .update(rest)
          .eq("id", id);
        if (initial.error) {
          if (!isMissingColumnError(initial.error)) throw initial.error;
          const fallbackPayload = stripUnsupportedColumns(table, rest);
          const fallback = await supabase
            .from(table as any)
            .update(fallbackPayload)
            .eq("id", id);
          if (fallback.error) throw fallback.error;
        }
        return null;
      } else {
        const initial = await supabase
          .from(table as any)
          .insert({ ...rest, user_id: user.id })
          .select("*")
          .single();
        if (initial.error) {
          if (!isMissingColumnError(initial.error)) throw initial.error;
          const fallbackPayload = stripUnsupportedColumns(table, rest);
          const fallback = await supabase
            .from(table as any)
            .insert({ ...fallbackPayload, user_id: user.id })
            .select("*")
            .single();
          if (fallback.error) throw fallback.error;
          return fallback.data;
        }
        return initial.data;
      }
    },
    onSuccess: async (row) => {
      const createdRow = row as { id?: string } | null;
      const eventType = WORKFLOW_EVENT_BY_TABLE[table];
      if (createdRow?.id && eventType) {
        try {
          await apiPost("/api/n8n/events", {
            eventType,
            entityType: table,
            entityId: createdRow.id,
            payload: createdRow as Record<string, unknown>,
          });
        } catch {
          // Persisting the primary record takes priority over auxiliary event emission.
        }
      }
      qc.invalidateQueries({ queryKey: [queryKeyPrefix] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCrudDelete(table: TableName, queryKeyPrefix: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(table as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKeyPrefix] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
