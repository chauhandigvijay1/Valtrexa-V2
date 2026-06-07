import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseResearchIntelligence, parsePainPoint } from "@/lib/workflow-intelligence";
import {
  Sparkles,
  Trash2,
  Pencil,
  ExternalLink,
  Radar,
  Send,
  RefreshCcw,
  Target,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type ResearchRecord = {
  id: string;
  company_name: string;
  summary: string | null;
  recent_news: string | null;
  tech_stack: string[] | null;
  culture_notes: string | null;
  source_urls: string[] | null;
  file_url: string | null;
  company_id: string | null;
};

type PainPointRecord = {
  id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  source_url: string | null;
  severity: number;
  tags: string[] | null;
};

export const Route = createFileRoute("/_authenticated/company-research")({
  component: CompanyResearchPage,
});

function CompanyResearchPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<
    (Partial<ResearchRecord> & { _tech?: string; _urls?: string }) | null
  >(null);
  const [generating, setGenerating] = useState(false);
  const [generateCompany, setGenerateCompany] = useState("");
  const [generateWebsite, setGenerateWebsite] = useState("");
  const [generateTargetValue, setGenerateTargetValue] = useState<"normal" | "high">("high");
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  const [targetingEditing, setTargetingEditing] = useState<{
    companyName: string;
    targetValue: "normal" | "high";
    qualityScore?: number;
    activityScore?: number;
    strategicScore?: number;
  } | null>(null);
  const debounced = useDebounced(search, 300);

  const q = useCrudList<ResearchRecord>({
    table: "company_research",
    searchColumn: "company_name",
    search: debounced,
    page,
  });

  const companiesList = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleTargetValueMutation = useMutation({
    mutationFn: async (payload: {
      companyName: string;
      targetValue: "normal" | "high";
      qualityScore?: number;
      activityScore?: number;
      strategicScore?: number;
    }) => {
      const existingCompany = (companiesList.data ?? []).find(
        (c) => c.name.toLowerCase() === payload.companyName.toLowerCase(),
      );
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      if (!userId) throw new Error("User not authenticated");

      const body = {
        name: payload.companyName,
        target_value: payload.targetValue,
        company_quality_score: payload.qualityScore ?? 0,
        hiring_activity_score: payload.activityScore ?? 0,
        strategic_value_score: payload.strategicScore ?? 0,
        user_id: userId,
      };

      if (existingCompany) {
        const { error } = await supabase
          .from("companies")
          .update(body)
          .eq("id", existingCompany.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("companies").insert(body);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies-list"] });
      toast.success("Targeting classification updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useCrudSave<Partial<ResearchRecord>>("company_research", "company_research");
  const del = useCrudDelete("company_research", "company_research");

  const painPoints = useQuery({
    queryKey: ["painpoints", "research-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("painpoints")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PainPointRecord[];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (input: { companyName: string; website?: string }) =>
      apiPost("/api/company-research/generate", {
        companyName: input.companyName,
        website: input.website || undefined,
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["company_research"] }),
        qc.invalidateQueries({ queryKey: ["painpoints"] }),
      ]);
      setActiveCompany(variables.companyName);
      setGenerating(false);
      setGenerateCompany("");
      setGenerateWebsite("");
      toast.success("Company research and pain points generated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const regeneratePainPoints = useMutation({
    mutationFn: async (companyName: string) => apiPost("/api/painpoints/generate", { companyName }),
    onSuccess: async (_, companyName) => {
      await qc.invalidateQueries({ queryKey: ["painpoints"] });
      setActiveCompany(companyName);
      toast.success("Pain points refreshed from stored research.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const painPointsByCompany = useMemo(() => {
    return (painPoints.data ?? []).reduce<Record<string, PainPointRecord[]>>((acc, item) => {
      const key = item.company_name ?? "Unknown";
      acc[key] = [...(acc[key] ?? []), item];
      return acc;
    }, {});
  }, [painPoints.data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const company = params.get("company")?.trim();
    const website = params.get("website")?.trim();
    if (!company) return;
    setActiveCompany(company);
    setGenerateCompany((current) => current || company);
    setGenerateWebsite((current) => current || website || "");
    setGenerating(true);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Research Engine"
        description="Generate research once, persist it, and immediately turn it into pain points and outreach-ready intelligence."
      />
      <CrudShell
        search={search}
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        onNew={() => setEditing({})}
        newLabel="Manual entry"
        filters={
          <Button variant="outline" size="sm" onClick={() => setGenerating(true)}>
            <Sparkles className="mr-1 h-4 w-4" /> Generate
          </Button>
        }
        loading={q.isLoading || painPoints.isLoading}
        error={q.error ?? painPoints.error}
        empty={(q.data?.rows.length ?? 0) === 0}
        count={q.data?.count ?? 0}
        page={page}
        setPage={setPage}
      >
        <div className="space-y-4">
          {(q.data?.rows ?? []).map((row) => {
            const companyPainPoints = painPointsByCompany[row.company_name] ?? [];
            const intelligence = parseResearchIntelligence(row, companyPainPoints);
            const highlightedPainPoints = companyPainPoints.map((item) => ({
              ...item,
              details: parsePainPoint(item.description, item.tags, item.source_url),
            }));
            const expanded = activeCompany === row.company_name || highlightedPainPoints.length > 0;

            const comp = (companiesList.data ?? []).find(
              (c) => c.name.toLowerCase() === row.company_name.toLowerCase(),
            );
            const isHigh = comp?.target_value === "high";

            return (
              <Card
                key={row.id}
                className={`space-y-4 p-5 ${activeCompany === row.company_name ? "border-primary/50 shadow-sm" : ""}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold">{row.company_name}</div>
                      <Badge variant="secondary">
                        {companyPainPoints.length} pain point
                        {companyPainPoints.length === 1 ? "" : "s"}
                      </Badge>
                      {intelligence.products.length > 0 && (
                        <Badge variant="outline">{intelligence.products.length} products</Badge>
                      )}
                      {isHigh ? (
                        <Badge className="flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20">
                          <Target className="h-3.5 w-3.5" /> High Value Target
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="flex items-center gap-1 text-muted-foreground"
                        >
                          Normal Target
                        </Badge>
                      )}
                      {comp &&
                        ((comp.company_quality_score ?? 0) > 0 ||
                          (comp.hiring_activity_score ?? 0) > 0 ||
                          (comp.strategic_value_score ?? 0) > 0) && (
                          <Badge variant="outline" className="text-xs">
                            Quality: {comp.company_quality_score ?? 0} | Hiring:{" "}
                            {comp.hiring_activity_score ?? 0} | Strategic:{" "}
                            {comp.strategic_value_score ?? 0}
                          </Badge>
                        )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {row.summary ?? "No summary stored yet."}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(row.tech_stack ?? []).slice(0, 8).map((tech) => (
                        <Badge key={tech} variant="secondary">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {!isHigh && (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500 border border-amber-500/20 w-full lg:w-auto">
                      <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                      <span>Strategic features locked for Normal Targets.</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!isHigh}
                      onClick={() => {
                        setGenerating(true);
                        setGenerateCompany(row.company_name);
                        setGenerateTargetValue("high");
                      }}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Refresh research
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!isHigh || regeneratePainPoints.isPending}
                      onClick={() => regeneratePainPoints.mutate(row.company_name)}
                    >
                      <Radar className="mr-2 h-4 w-4" />
                      Refresh pain points
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!isHigh}
                      onClick={() =>
                        window.location.assign(
                          `/outreach?company=${encodeURIComponent(row.company_name)}`,
                        )
                      }
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Open campaign studio
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTargetingEditing({
                          companyName: row.company_name,
                          targetValue: comp?.target_value === "high" ? "high" : "normal",
                          qualityScore: comp?.company_quality_score ?? 0,
                          activityScore: comp?.hiring_activity_score ?? 0,
                          strategicScore: comp?.strategic_value_score ?? 0,
                        });
                      }}
                    >
                      <Target className="mr-2 h-4 w-4 text-amber-500" />
                      Configure Target
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          ...row,
                          _tech: (row.tech_stack ?? []).join(", "),
                          _urls: (row.source_urls ?? []).join("\n"),
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => confirm("Delete company research?") && del.mutate(row.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <>
                    <Separator />
                    <div className="grid gap-4 xl:grid-cols-2">
                      <InfoCard
                        title="Research Summary"
                        body={row.summary ?? "No summary stored yet."}
                      />
                      <InfoCard
                        title="Recent News"
                        body={row.recent_news ?? "No recent-news block stored yet."}
                      />
                      <TagCard
                        title="Products"
                        items={intelligence.products}
                        empty="No product list stored."
                      />
                      <TagCard
                        title="Hiring Signals"
                        items={intelligence.hiringSignals}
                        empty="No hiring signals stored."
                      />
                      <InfoCard
                        title="Funding Data"
                        body={
                          intelligence.fundingData
                            ? JSON.stringify(intelligence.fundingData, null, 2)
                            : "No funding data stored."
                        }
                      />
                      <ListCard
                        title="Opportunities"
                        items={intelligence.opportunities}
                        empty="No derived opportunities yet."
                      />
                      <ListCard
                        title="Risks"
                        items={intelligence.risks}
                        empty="No explicit risks surfaced yet."
                      />
                      <ListCard
                        title="Suggested Outreach Angles"
                        items={intelligence.outreachAngles}
                        empty="No outreach angles derived yet."
                      />
                      <ListCard
                        title="Pain Point Candidates"
                        items={intelligence.painPointCandidates}
                        empty="No pain-point candidates visible yet."
                      />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                      <InfoCard
                        title="Engineering Culture Notes"
                        body={
                          intelligence.engineeringCultureNotes ||
                          row.culture_notes ||
                          "No culture notes stored yet."
                        }
                      />
                      <Card className="space-y-3 p-4">
                        <div className="text-sm font-semibold">Sources</div>
                        <div className="space-y-2 text-sm">
                          {(row.source_urls ?? []).length ? (
                            row.source_urls?.map((url) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-primary hover:underline"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span className="truncate">{url}</span>
                              </a>
                            ))
                          ) : (
                            <div className="text-muted-foreground">No source URLs stored.</div>
                          )}
                        </div>
                      </Card>
                    </div>

                    <Card className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Linked Pain Points</div>
                          <div className="text-xs text-muted-foreground">
                            Generated automatically from the stored company research and live job
                            signals.
                          </div>
                        </div>
                        <Badge variant="secondary">{highlightedPainPoints.length}</Badge>
                      </div>
                      {highlightedPainPoints.length ? (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {highlightedPainPoints.map((item) => (
                            <Card key={item.id} className="space-y-2 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium">{item.title}</div>
                                <Badge variant={item.severity >= 4 ? "destructive" : "secondary"}>
                                  {item.severity}/5
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {item.details.narrative || item.description}
                              </div>
                              <div className="text-sm">
                                <span className="font-medium">Evidence:</span>{" "}
                                {item.details.evidence || "Not broken out yet."}
                              </div>
                              <div className="text-sm">
                                <span className="font-medium">Suggested solution:</span>{" "}
                                {item.details.suggestedSolution || "Not broken out yet."}
                              </div>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                          No pain points are visible for this company yet.
                        </div>
                      )}
                    </Card>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </CrudShell>

      {generating && (
        <Dialog open onOpenChange={(open) => !open && setGenerating(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate company research</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Company name *</Label>
                <Input
                  aria-label="Company name *"
                  value={generateCompany}
                  onChange={(event) => setGenerateCompany(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  aria-label="Website"
                  value={generateWebsite}
                  onChange={(event) => setGenerateWebsite(event.target.value)}
                  placeholder="https://company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Target Classification *</Label>
                <Select
                  value={generateTargetValue}
                  onValueChange={(val: "normal" | "high") => setGenerateTargetValue(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select target status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal Target (Save only, no research)</SelectItem>
                    <SelectItem value="high">
                      High Value Target (Run AI research & campaigns)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {generateTargetValue === "normal" && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500 border border-amber-500/20">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                  <span>
                    Strategic research cannot be run for normal targets. Saving this company will
                    only register it in your company list.
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setGenerating(false)}>
                Cancel
              </Button>
              {generateTargetValue === "normal" ? (
                <Button
                  disabled={toggleTargetValueMutation.isPending || !generateCompany.trim()}
                  onClick={() => {
                    toggleTargetValueMutation.mutate(
                      {
                        companyName: generateCompany,
                        targetValue: "normal",
                      },
                      {
                        onSuccess: () => setGenerating(false),
                      },
                    );
                  }}
                >
                  {toggleTargetValueMutation.isPending ? "Saving..." : "Save Classification Only"}
                </Button>
              ) : (
                <Button
                  disabled={
                    generateMutation.isPending ||
                    toggleTargetValueMutation.isPending ||
                    !generateCompany.trim()
                  }
                  onClick={async () => {
                    try {
                      await toggleTargetValueMutation.mutateAsync({
                        companyName: generateCompany,
                        targetValue: "high",
                      });
                      generateMutation.mutate({
                        companyName: generateCompany,
                        website: generateWebsite || undefined,
                      });
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  {generateMutation.isPending || toggleTargetValueMutation.isPending
                    ? "Generating..."
                    : "Generate"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit research" : "New research"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Company name *</Label>
                <Input
                  value={editing.company_name ?? ""}
                  onChange={(event) => setEditing({ ...editing, company_name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Summary</Label>
                <Textarea
                  rows={3}
                  value={editing.summary ?? ""}
                  onChange={(event) => setEditing({ ...editing, summary: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Recent news</Label>
                <Textarea
                  rows={3}
                  value={editing.recent_news ?? ""}
                  onChange={(event) => setEditing({ ...editing, recent_news: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tech stack (comma separated)</Label>
                <Input
                  value={editing._tech ?? ""}
                  onChange={(event) => setEditing({ ...editing, _tech: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Culture notes</Label>
                <Textarea
                  rows={5}
                  value={editing.culture_notes ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, culture_notes: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Source URLs (one per line)</Label>
                <Textarea
                  rows={3}
                  value={editing._urls ?? ""}
                  onChange={(event) => setEditing({ ...editing, _urls: event.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending || !editing.company_name}
                onClick={() => {
                  const { _tech, _urls, ...rest } = editing;
                  save.mutate(
                    {
                      ...rest,
                      tech_stack: (_tech ?? "")
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                      source_urls: (_urls ?? "")
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    } as Partial<ResearchRecord>,
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

      {targetingEditing && (
        <Dialog open onOpenChange={(o) => !o && setTargetingEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configure Target: {targetingEditing.companyName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Target Classification</Label>
                <Select
                  value={targetingEditing.targetValue}
                  onValueChange={(val: "normal" | "high") =>
                    setTargetingEditing({ ...targetingEditing, targetValue: val })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select target status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal Target</SelectItem>
                    <SelectItem value="high">High Value Target</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Company Quality Score (0-100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={targetingEditing.qualityScore ?? 0}
                  onChange={(e) =>
                    setTargetingEditing({
                      ...targetingEditing,
                      qualityScore: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hiring Activity Score (0-100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={targetingEditing.activityScore ?? 0}
                  onChange={(e) =>
                    setTargetingEditing({
                      ...targetingEditing,
                      activityScore: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Strategic Value Score (0-100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={targetingEditing.strategicScore ?? 0}
                  onChange={(e) =>
                    setTargetingEditing({
                      ...targetingEditing,
                      strategicScore: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setTargetingEditing(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  toggleTargetValueMutation.mutate(targetingEditing, {
                    onSuccess: () => setTargetingEditing(null),
                  });
                }}
                disabled={toggleTargetValueMutation.isPending}
              >
                {toggleTargetValueMutation.isPending ? "Saving..." : "Save Classification"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="space-y-2 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{body}</div>
    </Card>
  );
}

function TagCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="text-sm font-semibold">{title}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">{empty}</div>
      )}
    </Card>
  );
}

function ListCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="text-sm font-semibold">{title}</div>
      {items.length ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">{empty}</div>
      )}
    </Card>
  );
}
