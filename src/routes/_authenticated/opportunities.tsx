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
import { ROLE_OPTIONS } from "@/lib/role-taxonomy";

type JobStatus = "open" | "closed" | "saved" | "archived";
type JobPriority = "low" | "medium" | "high";
type WorkMode = "remote" | "hybrid" | "onsite";

const STATUSES: JobStatus[] = ["open", "saved", "closed", "archived"];
const PRIORITIES: JobPriority[] = ["low", "medium", "high"];
const EXPERIENCE_OPTIONS = [
  "Fresher",
  "0-1 Years",
  "1-2 Years",
  "2-3 Years",
  "3-5 Years",
  "5+ Years",
] as const;
const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const FRESHNESS_OPTIONS = ["24h", "3d", "7d", "30d", "older"] as const;
const COMPANY_SIZES = ["startup", "mid", "enterprise"] as const;

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
  normalized_roles: string[] | null;
  experience_level: string | null;
  work_mode: WorkMode | null;
  salary_min: number | null;
  salary_max: number | null;
  company_size: string | null;
  freshness_bucket: string | null;
  easy_apply: boolean | null;
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
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [experienceFilter, setExperienceFilter] = useState<string>("all");
  const [workModeFilter, setWorkModeFilter] = useState<WorkMode | "all">("all");
  const [companySizeFilter, setCompanySizeFilter] = useState<string>("all");
  const [freshnessFilter, setFreshnessFilter] = useState<string>("all");
  const [salaryBandFilter, setSalaryBandFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [easyApplyOnly, setEasyApplyOnly] = useState(false);
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
      if (roleFilter !== "all") result = result.contains("normalized_roles", [roleFilter]);
      if (experienceFilter !== "all") result = result.eq("experience_level", experienceFilter);
      if (workModeFilter !== "all") result = result.eq("work_mode", workModeFilter);
      if (companySizeFilter !== "all") result = result.eq("company_size", companySizeFilter);
      if (freshnessFilter !== "all") result = result.eq("freshness_bucket", freshnessFilter);
      if (easyApplyOnly) result = result.eq("easy_apply", true);
      if (locationFilter.trim()) result = result.ilike("location", `%${locationFilter.trim()}%`);
      if (salaryBandFilter === "0-100k") result = result.lte("salary_min", 100000);
      if (salaryBandFilter === "100k-150k") {
        result = result.gte("salary_min", 100000).lte("salary_max", 150000);
      }
      if (salaryBandFilter === "150k+") result = result.gte("salary_max", 150000);
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
      if (!resolvedValue) {
        throw new Error(
          "Enter a board token, site, board URL, or search URL, or save one in Settings.",
        );
      }
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
        description="Import jobs from real sources, expand role coverage, and filter the pipeline by fit, experience, work mode, and application friction."
      />
      <CrudShell
        search={search}
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        onNew={() =>
          setEditing({
            status: "open",
            priority: "medium",
            match_score: 0,
            work_mode: "remote",
            experience_level: "Fresher",
            company_size: "startup",
            easy_apply: false,
          })
        }
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
            <Select
              value={roleFilter}
              onValueChange={(value) => {
                setPage(1);
                setRoleFilter(value);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={experienceFilter}
              onValueChange={(value) => {
                setPage(1);
                setExperienceFilter(value);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Experience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All experience</SelectItem>
                {EXPERIENCE_OPTIONS.map((experience) => (
                  <SelectItem key={experience} value={experience}>
                    {experience}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={workModeFilter}
              onValueChange={(value) => {
                setPage(1);
                setWorkModeFilter(value as WorkMode | "all");
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Work mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                {WORK_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode} className="capitalize">
                    {mode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={locationFilter}
              onChange={(event) => {
                setPage(1);
                setLocationFilter(event.target.value);
              }}
              placeholder="Location"
              className="w-[160px]"
            />
            <Select
              value={salaryBandFilter}
              onValueChange={(value) => {
                setPage(1);
                setSalaryBandFilter(value);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Salary" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All salaries</SelectItem>
                <SelectItem value="0-100k">Up to 100k</SelectItem>
                <SelectItem value="100k-150k">100k - 150k</SelectItem>
                <SelectItem value="150k+">150k+</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={companySizeFilter}
              onValueChange={(value) => {
                setPage(1);
                setCompanySizeFilter(value);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Company size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sizes</SelectItem>
                {COMPANY_SIZES.map((size) => (
                  <SelectItem key={size} value={size} className="capitalize">
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={freshnessFilter}
              onValueChange={(value) => {
                setPage(1);
                setFreshnessFilter(value);
              }}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Freshness" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ages</SelectItem>
                {FRESHNESS_OPTIONS.map((freshness) => (
                  <SelectItem key={freshness} value={freshness}>
                    {freshness}
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
            <Button
              variant={easyApplyOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPage(1);
                setEasyApplyOnly(!easyApplyOnly);
              }}
            >
              Easy Apply
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
              <TableHead>Fit</TableHead>
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
                  {!!job.normalized_roles?.length && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {job.normalized_roles.slice(0, 3).map((role) => (
                        <Badge key={role} variant="outline">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>{job.company_name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{job.location ?? "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {job.work_mode && (
                      <Badge variant="outline" className="capitalize">
                        {job.work_mode}
                      </Badge>
                    )}
                    {job.experience_level && (
                      <Badge variant="outline">{job.experience_level}</Badge>
                    )}
                    {job.easy_apply && <Badge variant="secondary">Easy Apply</Badge>}
                  </div>
                </TableCell>
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
                <Label>
                  {sourceType === "greenhouse"
                    ? "Board token"
                    : sourceType === "lever"
                      ? "Site"
                      : sourceType === "ashby"
                        ? "Board URL"
                        : "Search URL"}
                </Label>
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
                Imported jobs are automatically classified for role coverage, experience band, work
                mode, freshness, and easy-apply signals.
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
                {importMutation.isPending ? "Importing..." : "Import jobs"}
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
                <div className="space-y-1.5">
                  <Label>Work mode</Label>
                  <Select
                    value={editing.work_mode ?? "remote"}
                    onValueChange={(value) =>
                      setEditing({ ...editing, work_mode: value as WorkMode })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode} className="capitalize">
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Field
                  label="Salary range"
                  value={editing.salary_range ?? ""}
                  onChange={(value) => setEditing({ ...editing, salary_range: value })}
                />
                <div className="space-y-1.5">
                  <Label>Salary minimum</Label>
                  <Input
                    type="number"
                    value={editing.salary_min ?? ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        salary_min: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Salary maximum</Label>
                  <Input
                    type="number"
                    value={editing.salary_max ?? ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        salary_max: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </div>
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
                  <Label>Experience level</Label>
                  <Select
                    value={editing.experience_level ?? "Fresher"}
                    onValueChange={(value) => setEditing({ ...editing, experience_level: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPERIENCE_OPTIONS.map((experience) => (
                        <SelectItem key={experience} value={experience}>
                          {experience}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Company size</Label>
                  <Select
                    value={editing.company_size ?? "startup"}
                    onValueChange={(value) => setEditing({ ...editing, company_size: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZES.map((size) => (
                        <SelectItem key={size} value={size} className="capitalize">
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <Label>Match score (0-100)</Label>
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
                <div className="space-y-1.5">
                  <Label>Role labels (comma separated)</Label>
                  <Input
                    value={(editing.normalized_roles ?? []).join(", ")}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        normalized_roles: event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Freshness bucket</Label>
                  <Select
                    value={editing.freshness_bucket ?? "older"}
                    onValueChange={(value) => setEditing({ ...editing, freshness_bucket: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FRESHNESS_OPTIONS.map((freshness) => (
                        <SelectItem key={freshness} value={freshness}>
                          {freshness}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 flex items-center justify-between border rounded-md p-3 bg-muted/10">
                  <div>
                    <Label className="font-semibold text-sm">Easy Apply</Label>
                    <div className="text-xs text-muted-foreground">
                      Highlight quick-apply jobs in search and auto-apply flows
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={editing.easy_apply ?? false}
                    onChange={(event) =>
                      setEditing({ ...editing, easy_apply: event.target.checked })
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
                {save.isPending ? "Saving..." : "Save"}
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
