import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { CrudShell, useDebounced } from "@/components/crud-shell";
import { useCrudDelete, useCrudList, useCrudSave } from "@/hooks/use-crud";
import { Card } from "@/components/ui/card";
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
import { parsePainPoint } from "@/lib/workflow-intelligence";
import {
  ExternalLink,
  Pencil,
  Sparkles,
  Trash2,
  Send,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";

type PainPoint = {
  id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  source_url: string | null;
  severity: number;
  tags: string[] | null;
};

type CompanyResearch = {
  company_name: string;
  summary: string | null;
};

export const Route = createFileRoute("/_authenticated/painpoints")({
  component: PainPointsPage,
  head: () => ({ meta: [{ title: "Pain Points — VALTREXA-V2" }] }),
});

function PainPointsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<(Partial<PainPoint> & { _tags?: string }) | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [generating, setGenerating] = useState(false);
  const debounced = useDebounced(search, 300);
  const q = useCrudList<PainPoint>({
    table: "painpoints",
    searchColumn: "title",
    search: debounced,
    page,
  });
  const save = useCrudSave<Partial<PainPoint>>("painpoints", "painpoints");
  const del = useCrudDelete("painpoints", "painpoints");

  const research = useQuery({
    queryKey: ["company-research", "painpoints-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_research")
        .select("company_name,summary");
      if (error) throw error;
      return (data ?? []) as CompanyResearch[];
    },
  });

  const companiesList = useQuery({
    queryKey: ["companies-list-painpoints"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (input: { companyName: string }) =>
      apiPost("/api/painpoints/generate", { companyName: input.companyName }),
    onSuccess: async (_, variables) => {
      await qc.invalidateQueries({ queryKey: ["painpoints"] });
      setGenerating(false);
      setCompanyName("");
      toast.success(`Pain points refreshed for ${variables.companyName}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const grouped = useMemo(() => {
    const researchByCompany = (research.data ?? []).reduce<Record<string, CompanyResearch>>(
      (acc, item) => {
        acc[item.company_name] = item;
        return acc;
      },
      {},
    );
    return (q.data?.rows ?? []).reduce<
      Record<string, { company: string; summary: string | null; items: PainPoint[] }>
    >((acc, item) => {
      const company = item.company_name ?? "Unknown company";
      acc[company] = acc[company] ?? {
        company,
        summary: researchByCompany[company]?.summary ?? null,
        items: [],
      };
      acc[company].items.push(item);
      return acc;
    }, {});
  }, [q.data?.rows, research.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pain Point Engine"
        description="Company research now flows directly into pain points. Use this page to review the stored records and launch outreach from them."
      />
      <CrudShell
        search={search}
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        onNew={() => setEditing({ severity: 3 })}
        newLabel="Manual entry"
        filters={
          <Button variant="outline" size="sm" onClick={() => setGenerating(true)}>
            <Sparkles className="mr-1 h-4 w-4" /> Regenerate
          </Button>
        }
        loading={q.isLoading || research.isLoading}
        error={q.error ?? research.error}
        empty={(q.data?.rows.length ?? 0) === 0}
        count={q.data?.count ?? 0}
        page={page}
        setPage={setPage}
      >
        <div className="space-y-4">
          {Object.values(grouped).map((group) => {
            const comp = (companiesList.data ?? []).find(
              (c) => c.name.toLowerCase() === group.company.toLowerCase(),
            );
            const isHigh = comp?.target_value === "high";
            return (
              <Card key={group.company} className="space-y-4 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold">{group.company}</div>
                      <Badge variant="secondary">{group.items.length} records</Badge>
                      {isHigh ? (
                        <Badge className="bg-destructive/10 text-destructive border border-destructive/20">
                          High Value Target
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Normal Target
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {group.summary ?? "No linked company-research summary stored yet."}
                    </div>
                  </div>
                  {!isHigh && (
                    <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning border border-warning/20 w-full lg:w-auto">
                      <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                      <span>Strategic features locked for Normal Targets.</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!isHigh || generateMutation.isPending}
                      onClick={() => generateMutation.mutate({ companyName: group.company })}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Refresh from research
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!isHigh}
                      onClick={() =>
                        window.location.assign(
                          `/outreach?company=${encodeURIComponent(group.company)}`,
                        )
                      }
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Open campaign studio
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {group.items.map((row) => {
                    const parsed = parsePainPoint(row.description, row.tags, row.source_url);
                    return (
                      <Card key={row.id} className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{row.title}</div>
                          <Badge variant={row.severity >= 4 ? "destructive" : "secondary"}>
                            {row.severity}/5
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {parsed.narrative || row.description || "No narrative stored."}
                        </div>
                        <div className="space-y-1 text-sm">
                          <div>
                            <span className="font-medium">Evidence:</span>{" "}
                            {parsed.evidence || "No evidence broken out yet."}
                          </div>
                          <div>
                            <span className="font-medium">Suggested solution:</span>{" "}
                            {parsed.suggestedSolution || "No suggested solution broken out yet."}
                          </div>
                          <div>
                            <span className="font-medium">Signal:</span>{" "}
                            {parsed.signalSource ?? "company evidence"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(row.tags ?? []).map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex justify-between gap-2">
                          <div>
                            {row.source_url ? (
                              <a
                                href={row.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Source
                              </a>
                            ) : (
                              <span className="text-sm text-muted-foreground">No source URL</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setEditing({ ...row, _tags: (row.tags ?? []).join(", ") })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => confirm("Delete pain point?") && del.mutate(row.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </CrudShell>

      {generating && (
        <Dialog open onOpenChange={(open) => !open && setGenerating(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate pain points from stored research</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Company name *</Label>
                <Input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
              </div>
              {companyName.trim() &&
                (() => {
                  const comp = (companiesList.data ?? []).find(
                    (c) => c.name.toLowerCase() === companyName.toLowerCase(),
                  );
                  const isHigh = comp?.target_value === "high";
                  if (!isHigh) {
                    return (
                      <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning border border-warning/20">
                        <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                        <span>
                          Pain points are gated to High Value Targets. Mark this company as a High
                          Value Target in Company Research to unlock.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setGenerating(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  generateMutation.isPending ||
                  !companyName.trim() ||
                  !(
                    (companiesList.data ?? []).find(
                      (c) => c.name.toLowerCase() === companyName.toLowerCase(),
                    )?.target_value === "high"
                  )
                }
                onClick={() => generateMutation.mutate({ companyName })}
              >
                {generateMutation.isPending ? "Generating..." : "Generate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit pain point" : "New pain point"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Company name</Label>
                <Input
                  value={editing.company_name ?? ""}
                  onChange={(event) => setEditing({ ...editing, company_name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={5}
                  value={editing.description ?? ""}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Severity (1–5)</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={editing.severity ?? 3}
                  onChange={(event) =>
                    setEditing({ ...editing, severity: Number(event.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tags (comma separated)</Label>
                <Input
                  value={editing._tags ?? ""}
                  onChange={(event) => setEditing({ ...editing, _tags: event.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending || !editing.title}
                onClick={() => {
                  const { _tags, ...rest } = editing;
                  save.mutate(
                    {
                      ...rest,
                      tags: (_tags ?? "")
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    } as Partial<PainPoint>,
                    { onSuccess: () => setEditing(null) },
                  );
                }}
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
