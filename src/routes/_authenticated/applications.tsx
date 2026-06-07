import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { CrudShell, useDebounced } from "@/components/crud-shell";
import { useCrudDelete, useCrudList, useCrudSave } from "@/hooks/use-crud";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pencil,
  Trash2,
  Wand2,
  Loader2,
  Search,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";
import { apiPost, apiGet } from "@/lib/api-client";
import { toast } from "sonner";

type AppStatus =
  | "saved"
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "accepted";
const STATUSES: AppStatus[] = [
  "saved",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "accepted",
];

type Application = {
  id: string;
  company_name: string;
  role_title: string;
  status: AppStatus;
  source: string | null;
  notes: string | null;
  applied_at: string | null;
  resume_version_id: string | null;
  job_id: string | null;
  tier?: string | null;
  match_score?: number | null;
  package_generated?: boolean | null;
};

const statusColor: Record<AppStatus, string> = {
  saved: "bg-muted text-foreground",
  applied: "bg-blue-500/15 text-blue-400",
  screening: "bg-amber-500/15 text-amber-400",
  interview: "bg-purple-500/15 text-purple-400",
  offer: "bg-emerald-500/15 text-emerald-400",
  accepted: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-destructive/15 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
};

const tierColor: Record<string, string> = {
  A: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  B: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  C: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  D: "bg-red-500/20 text-red-300 border-red-500/30",
};

export const Route = createFileRoute("/_authenticated/applications")({
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<AppStatus | "all">("all");
  const [editing, setEditing] = useState<Partial<Application> | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  const debounced = useDebounced(search, 300);

  const q = useCrudList<Application>({
    table: "applications",
    searchColumn: "company_name",
    search: debounced,
    page,
    extraFilter: (qb) => (statusFilter !== "all" ? qb.eq("status", statusFilter) : qb),
    orderBy: "applied_at",
    ascending: false,
  });

  const resumes = useQuery({
    queryKey: ["resume-versions-list"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resume_versions")
        .select("id, version, notes, resumes:resume_id(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const followupsQuery = useQuery({
    queryKey: ["followups-for-apps"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("followups" as any)
        .select("*")
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const generatePackageMutation = useMutation({
    mutationFn: async (r: Application) => {
      setGeneratingId(r.id);
      return apiPost<{
        tier: string;
        qa: { question: string; answer: string }[];
        storedAnswers?: any[];
      }>("/api/applications/generate-package", {
        applicationId: r.id,
        companyName: r.company_name,
        jobId: r.job_id,
      });
    },
    onSuccess: async (data, r) => {
      await qc.invalidateQueries({ queryKey: ["applications"] });
      await qc.invalidateQueries({ queryKey: ["followups-for-apps"] });
      toast.success(
        `Application package generated — Tier ${data.tier} assigned. ${data.qa?.length ?? 0} Q&A generated.`,
      );
      setExpandedId(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setGeneratingId(null),
  });

  const discoverRecruitersMutation = useMutation({
    mutationFn: async (r: Application) => {
      setDiscoveringId(r.id);
      return apiPost<{ recruiters: any[]; companyName: string }>("/api/recruiters/discover", {
        companyName: r.company_name,
        roleTitle: r.role_title,
      });
    },
    onSuccess: async (data) => {
      toast.success(`Found ${data.recruiters.length} recruiter(s) at ${data.companyName}`);
      await qc.invalidateQueries({ queryKey: ["recruiters"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setDiscoveringId(null),
  });

  const createFollowUpMutation = useMutation({
    mutationFn: async (r: Application) => {
      return apiPost("/api/follow-ups/auto-create", {
        applicationId: r.id,
        companyName: r.company_name,
        action:
          r.status === "applied"
            ? "applied"
            : r.status === "screening"
              ? "screening"
              : r.status === "interview"
                ? "interview"
                : "applied",
      });
    },
    onSuccess: async () => {
      toast.success("Follow-up reminder created!");
      await qc.invalidateQueries({ queryKey: ["followups-for-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useCrudSave<Partial<Application>>("applications", "applications");
  const del = useCrudDelete("applications", "applications");
  const rows = q.data?.rows ?? [];
  const followups = followupsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="Applications" description="Track your pipeline end-to-end." />
      <CrudShell
        search={search}
        onSearch={(v) => {
          setPage(1);
          setSearch(v);
        }}
        onNew={() => setEditing({ status: "applied", applied_at: new Date().toISOString() })}
        newLabel="New application"
        filters={
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setPage(1);
              setStatusFilter(v as any);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        loading={q.isLoading}
        error={q.error}
        empty={rows.length === 0}
        count={q.data?.count ?? 0}
        page={page}
        setPage={setPage}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Follow-ups</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const appFollowups = followups.filter(
                (f: any) => f.application_id === r.id && !f.done,
              );
              return (
                <>
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.company_name}</TableCell>
                    <TableCell>{r.role_title}</TableCell>
                    <TableCell>
                      <Badge className={`capitalize ${statusColor[r.status]}`} variant="outline">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.tier ? (
                        <Badge variant="outline" className={`font-bold ${tierColor[r.tier] ?? ""}`}>
                          Tier {r.tier}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {appFollowups.length > 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          {appFollowups.length} pending
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.applied_at ? new Date(r.applied_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={generatingId === r.id}
                          title="Generate application package + assign tier"
                          onClick={() => generatePackageMutation.mutate(r)}
                        >
                          {generatingId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="h-4 w-4 text-purple-500" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={discoveringId === r.id}
                          title="Discover recruiters at this company"
                          onClick={() => discoverRecruitersMutation.mutate(r)}
                        >
                          {discoveringId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4 text-blue-500" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Create follow-up"
                          onClick={() => createFollowUpMutation.mutate(r)}
                        >
                          <CalendarPlus className="h-4 w-4 text-green-500" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={expandedId === r.id ? "Collapse Q&A" : "View Q&A"}
                          onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        >
                          {expandedId === r.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-amber-500" />
                          )}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => confirm("Delete application?") && del.mutate(r.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === r.id && (
                    <TableRow key={`${r.id}-qa`}>
                      <TableCell colSpan={7} className="p-0">
                        <ApplicationQAPanel applicationId={r.id} companyName={r.company_name} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </CrudShell>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit application" : "New application"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Company *</Label>
                  <Input
                    value={editing.company_name ?? ""}
                    onChange={(e) => setEditing({ ...editing, company_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role *</Label>
                  <Input
                    value={editing.role_title ?? ""}
                    onChange={(e) => setEditing({ ...editing, role_title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={editing.status ?? "applied"}
                    onValueChange={(v) => setEditing({ ...editing, status: v as AppStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Source</Label>
                  <Input
                    value={editing.source ?? ""}
                    onChange={(e) => setEditing({ ...editing, source: e.target.value })}
                    placeholder="LinkedIn, referral…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Applied date</Label>
                  <Input
                    type="date"
                    value={editing.applied_at?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        applied_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Resume version</Label>
                  <Select
                    value={editing.resume_version_id ?? "none"}
                    onValueChange={(v) =>
                      setEditing({ ...editing, resume_version_id: v === "none" ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(resumes.data ?? []).map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.resumes?.title ?? "Resume"} · v{v.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Application Tier</Label>
                  <Select
                    value={editing.tier ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing, tier: v === "none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="A">Tier A (High Priority)</SelectItem>
                      <SelectItem value="B">Tier B (Medium Priority)</SelectItem>
                      <SelectItem value="C">Tier C (Low Priority)</SelectItem>
                      <SelectItem value="D">Tier D (Very Low Priority)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Match Score (0-100)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editing.match_score ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        match_score: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5 flex items-center justify-between border rounded-md p-3 col-span-2 bg-muted/20">
                  <div>
                    <Label className="font-semibold text-sm">Package Generated</Label>
                    <div className="text-xs text-muted-foreground">
                      Indicates if tailored resume & QA package are ready
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                    checked={editing.package_generated ?? false}
                    onChange={(e) =>
                      setEditing({ ...editing, package_generated: e.target.checked })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  rows={4}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending || !editing.company_name || !editing.role_title}
                onClick={() => save.mutate(editing, { onSuccess: () => setEditing(null) })}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ApplicationQAPanel({
  applicationId,
  companyName,
}: {
  applicationId: string;
  companyName: string;
}) {
  const qaQuery = useQuery({
    queryKey: ["application-answers", applicationId],
    queryFn: async () => {
      try {
        return await apiGet<any[]>(`/api/applications/answers?applicationId=${applicationId}`);
      } catch {
        return [];
      }
    },
  });

  const answers = qaQuery.data ?? [];

  if (qaQuery.isLoading) {
    return (
      <div className="p-4 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Q&A…
      </div>
    );
  }

  if (answers.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground bg-muted/30 border-t">
        No Q&A generated yet. Click the <Wand2 className="inline h-3 w-3 text-purple-500" /> button
        to generate an application package.
      </div>
    );
  }

  return (
    <div className="p-4 bg-muted/30 border-t space-y-3">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-amber-500" />
        Generated Q&A for {companyName}
      </h4>
      <div className="grid gap-2">
        {answers.map((qa: any, i: number) => (
          <Card key={qa.id ?? i} className="bg-background/50">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                Q{i + 1}: {qa.question}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-sm">{qa.answer}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
