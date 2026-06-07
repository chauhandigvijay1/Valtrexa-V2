import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Bookmark,
  BookmarkCheck,
  Download,
  ExternalLink,
  Pencil,
  Radar,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api-client";

type JobStatus = "open" | "closed" | "saved" | "archived";
type JobPriority = "low" | "medium" | "high";
const STATUSES: JobStatus[] = ["open", "saved", "closed", "archived"];
const PRIORITIES: JobPriority[] = ["low", "medium", "high"];

type Job = {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  url: string | null;
  source: string | null;
  salary_range: string | null;
  description: string | null;
  status: JobStatus;
  priority: JobPriority;
  match_score: number | null;
  saved: boolean | null;
};

type SourceType = "greenhouse" | "lever" | "ashby" | "linkedin" | "naukri" | "wellfound";

export const Route = createFileRoute("/_authenticated/opportunities")({
  component: OpportunitiesPage,
});

function OpportunitiesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<JobPriority | "all">("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [editing, setEditing] = useState<Partial<Job> | null>(null);
  const [importing, setImporting] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("greenhouse");
  const [sourceValue, setSourceValue] = useState("");
  const debounced = useDebounced(search, 300);
  const importIntegrations = useQuery({
    queryKey: ["job-import-integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select("provider,config,enabled")
        .in("provider", ["greenhouse", "lever", "ashby", "linkedin", "naukri", "wellfound"])
        .eq("enabled", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resumes = useQuery({
    queryKey: ["resume-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resumes")
        .select("id,title,is_primary")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const primaryResumeId =
    resumes.data?.find((item) => item.is_primary)?.id ?? resumes.data?.[0]?.id ?? null;
  const activeImportConfig = importIntegrations.data?.find((item) => item.provider === sourceType)
    ?.config as Record<string, string> | undefined;
  const savedSourceValue =
    sourceType === "greenhouse"
      ? activeImportConfig?.board_token
      : sourceType === "lever"
        ? activeImportConfig?.site
        : sourceType === "ashby"
          ? activeImportConfig?.board_url
          : activeImportConfig?.search_url;

  const q = useCrudList<Job>({
    table: "jobs",
    searchColumn: "title",
    search: debounced,
    page,
    extraFilter: (qb) => {
      let result = qb;
      if (statusFilter !== "all") result = result.eq("status", statusFilter);
      if (priorityFilter !== "all") result = result.eq("priority", priorityFilter);
      if (savedOnly) result = result.eq("saved", true);
      return result;
    },
  });
  const save = useCrudSave<Partial<Job>>("jobs", "jobs");
  const del = useCrudDelete("jobs", "jobs");

  const toggleSaved = useMutation({
    mutationFn: async ({ id, saved }: { id: string; saved: boolean }) => {
      const { error } = await supabase.from("jobs").update({ saved }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const resolvedValue = sourceValue.trim() || savedSourceValue?.trim() || "";
      if (!resolvedValue)
        throw new Error(
          "Enter a board token, site, board URL, or search URL, or save one in Settings.",
        );
      const source =
        sourceType === "greenhouse"
          ? { source: "greenhouse", boardToken: resolvedValue }
          : sourceType === "lever"
            ? { source: "lever", site: resolvedValue }
            : sourceType === "ashby"
              ? { source: "ashby", boardUrl: resolvedValue }
              : { source: sourceType, searchUrl: resolvedValue };
      return apiPost<{ importedCount: number }>("/api/jobs/import", { sources: [source] });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      setImporting(false);
      setSourceValue("");
      toast.success(`Imported ${result.importedCount} jobs.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sourceLabel =
    sourceType === "greenhouse"
      ? "Board token"
      : sourceType === "lever"
        ? "Site"
        : sourceType === "ashby"
          ? "Board URL"
          : "Search URL";

  const matchMutation = useMutation({
    mutationFn: async (jobId: string) => {
      if (!primaryResumeId) throw new Error("Create and parse a primary resume first.");
      return apiPost("/api/jobs/match", { jobId, resumeId: primaryResumeId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job_matches"] });
      toast.success("Match generated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = q.data?.rows ?? [];

  const openResearch = (job: Job) => {
    const params = new URLSearchParams();
    if (job.company_name?.trim()) params.set("company", job.company_name.trim());
    const website = deriveResearchWebsite(job.url);
    if (website) params.set("website", website);
    window.location.assign(`/company-research?${params.toString()}`);
  };

  return (
    <div>
      <PageHeader
        title="Opportunity Radar"
        description="Import jobs from real sources and score them against your primary resume."
      />
      <CrudShell
        search={search}
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        onNew={() => setEditing({ status: "open", priority: "medium", match_score: 0 })}
        newLabel="New job"
        filters={
          <>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setPage(1);
                setStatusFilter(value as JobStatus | "all");
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priorityFilter}
              onValueChange={(value) => {
                setPage(1);
                setPriorityFilter(value as JobPriority | "all");
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority} className="capitalize">
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={savedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPage(1);
                setSavedOnly(!savedOnly);
              }}
            >
              <Bookmark className="h-4 w-4 mr-1" /> Saved
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Download className="h-4 w-4 mr-1" /> Import
            </Button>
          </>
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
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {job.title}
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>{job.company_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{job.location ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, job.match_score ?? 0)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{job.match_score ?? 0}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {job.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Generate match"
                      onClick={() => matchMutation.mutate(job.id)}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Research company"
                      disabled={!job.company_name?.trim()}
                      onClick={() => openResearch(job)}
                    >
                      <Radar className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={job.saved ? "Unsave job" : "Save job"}
                      onClick={() => toggleSaved.mutate({ id: job.id, saved: !job.saved })}
                    >
                      {job.saved ? (
                        <BookmarkCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Edit job"
                      onClick={() => setEditing(job)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete job"
                      onClick={() => confirm("Delete job?") && del.mutate(job.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CrudShell>

      {importing && (
        <Dialog open onOpenChange={(open) => !open && setImporting(false)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Import jobs</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select
                  value={sourceType}
                  onValueChange={(value) => setSourceType(value as SourceType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="greenhouse">Greenhouse board token</SelectItem>
                    <SelectItem value="lever">Lever site</SelectItem>
                    <SelectItem value="ashby">Ashby board URL</SelectItem>
                    <SelectItem value="linkedin">LinkedIn search URL</SelectItem>
                    <SelectItem value="naukri">Naukri search URL</SelectItem>
                    <SelectItem value="wellfound">Wellfound search URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{sourceLabel}</Label>
                <Input
                  value={sourceValue}
                  onChange={(event) => setSourceValue(event.target.value)}
                  placeholder={
                    savedSourceValue
                      ? `Saved default: ${savedSourceValue}`
                      : "Enter a source value or save one in Settings"
                  }
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Greenhouse, Lever, and Ashby use direct board ingestion. LinkedIn, Naukri, and
                Wellfound use real public-page scraping from the URL you provide or save in
                Settings.
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setImporting(false)}>
                Cancel
              </Button>
              <Button
                disabled={importMutation.isPending || (!sourceValue.trim() && !savedSourceValue)}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? "Importing…" : "Import jobs"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit job" : "New job"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <Field
                  label="Title *"
                  value={editing.title ?? ""}
                  onChange={(value) => setEditing({ ...editing, title: value })}
                />
                <Field
                  label="Company"
                  value={editing.company_name ?? ""}
                  onChange={(value) => setEditing({ ...editing, company_name: value })}
                />
                <Field
                  label="Location"
                  value={editing.location ?? ""}
                  onChange={(value) => setEditing({ ...editing, location: value })}
                />
                <Field
                  label="Salary range"
                  value={editing.salary_range ?? ""}
                  onChange={(value) => setEditing({ ...editing, salary_range: value })}
                />
                <Field
                  label="Source"
                  value={editing.source ?? ""}
                  onChange={(value) => setEditing({ ...editing, source: value })}
                />
                <Field
                  label="URL"
                  value={editing.url ?? ""}
                  onChange={(value) => setEditing({ ...editing, url: value })}
                />
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={editing.status ?? "open"}
                    onValueChange={(value) =>
                      setEditing({ ...editing, status: value as JobStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select
                    value={editing.priority ?? "medium"}
                    onValueChange={(value) =>
                      setEditing({ ...editing, priority: value as JobPriority })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority} className="capitalize">
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Match score (0–100)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editing.match_score ?? 0}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        match_score: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  aria-label="Description"
                  rows={6}
                  value={editing.description ?? ""}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending || !editing.title}
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function deriveResearchWebsite(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = [
      "linkedin.com",
      "www.linkedin.com",
      "naukri.com",
      "www.naukri.com",
      "wellfound.com",
      "www.wellfound.com",
      "greenhouse.io",
      "boards.greenhouse.io",
      "jobs.lever.co",
      "ashbyhq.com",
      "jobs.ashbyhq.com",
    ];
    if (blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}
