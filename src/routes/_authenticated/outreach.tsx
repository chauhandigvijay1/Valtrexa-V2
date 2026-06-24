import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseCampaignTemplate, parsePainPoint } from "@/lib/workflow-intelligence";
import {
  Pencil,
  Sparkles,
  Copy,
  RefreshCcw,
  Video,
  Calendar,
  Trash2,
  Plus,
  ShieldAlert,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiPost } from "@/lib/api-client";

type OutreachKind = "cold_email" | "linkedin_message";

type OutreachCampaign = {
  id: string;
  name: string;
  description: string | null;
  template: string | null;
  updated_at: string;
  created_at: string;
};

type OutreachMessageRow = {
  id: string;
  subject: string | null;
  body: string | null;
  status: "draft" | "sent" | "replied" | "no_response" | "bounced";
  recruiter_id: string | null;
  campaign_id: string | null;
  created_at: string;
};

type LoomScriptRow = {
  id: string;
  company_name: string;
  script_text: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type PainPointRow = {
  id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  source_url: string | null;
  severity: number;
  tags: string[] | null;
};

type ResumeOption = {
  id: string;
  title: string;
  is_primary: boolean | null;
};

type RecruiterOption = {
  id: string;
  name: string;
  company: string | null;
};

type ResearchOption = {
  company_name: string;
  summary: string | null;
};

export const Route = createFileRoute("/_authenticated/outreach")({ component: OutreachPage });

function OutreachPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editing, setEditing] = useState<OutreachMessageRow | null>(null);
  const [draft, setDraft] = useState({
    companyName: "",
    resumeId: "",
    recruiterId: "",
  });

  const campaigns = useQuery({
    queryKey: ["outreach-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_campaigns")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OutreachCampaign[];
    },
  });

  const messages = useQuery({
    queryKey: ["outreach-messages", "campaign-studio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OutreachMessageRow[];
    },
  });

  const loomScripts = useQuery({
    queryKey: ["loom-scripts", "campaign-studio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loom_scripts" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LoomScriptRow[];
    },
  });

  const painPoints = useQuery({
    queryKey: ["painpoints", "campaign-studio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("painpoints")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PainPointRow[];
    },
  });

  const research = useQuery({
    queryKey: ["company-research", "campaign-studio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_research")
        .select("company_name,summary")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResearchOption[];
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
      return (data ?? []) as ResumeOption[];
    },
  });

  const recruiters = useQuery({
    queryKey: ["recruiter-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters")
        .select("id,name,company")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecruiterOption[];
    },
  });

  const defaultResumeId =
    resumes.data?.find((item) => item.is_primary)?.id ?? resumes.data?.[0]?.id ?? "";

  useEffect(() => {
    if (!draft.resumeId && defaultResumeId) {
      setDraft((current) => ({ ...current, resumeId: defaultResumeId }));
    }
  }, [defaultResumeId, draft.resumeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const company = new URLSearchParams(window.location.search).get("company");
    if (!company) return;
    setDraft((current) => ({ ...current, companyName: current.companyName || company }));
    setGenerateOpen(true);
  }, []);

  const generateCampaignMutation = useMutation({
    mutationFn: async (input: { companyName: string; resumeId: string; recruiterId?: string }) =>
      apiPost<{ companyName: string; campaign: OutreachCampaign }>("/api/outreach/campaign", input),
    onSuccess: async (_, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["outreach-campaigns"] }),
        qc.invalidateQueries({ queryKey: ["outreach-messages"] }),
        qc.invalidateQueries({ queryKey: ["loom-scripts"] }),
        qc.invalidateQueries({ queryKey: ["painpoints"] }),
      ]);
      setGenerateOpen(false);
      setDraft({ companyName: variables.companyName, resumeId: defaultResumeId, recruiterId: "" });
      toast.success(`Campaign generated for ${variables.companyName}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (message: OutreachMessageRow) => {
      const { error } = await supabase
        .from("outreach_messages")
        .update({
          subject: message.subject,
          body: message.body,
          status: message.status,
        })
        .eq("id", message.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["outreach-messages"] });
      setEditing(null);
      toast.success("Outreach message saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const companiesList = useQuery({
    queryKey: ["companies-list-outreach"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const isSelectedCompanyHighTarget = useMemo(() => {
    if (!draft.companyName.trim()) return true;
    const comp = (companiesList.data ?? []).find(
      (c) => c.name.toLowerCase() === draft.companyName.toLowerCase(),
    );
    return comp?.target_value === "high";
  }, [draft.companyName, companiesList.data]);

  const followupsQuery = useQuery({
    queryKey: ["followups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("followups")
        .select("*")
        .order("due_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const applicationsQuery = useQuery({
    queryKey: ["followups-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id,company_name,role_title");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleFollowupMutation = useMutation({
    mutationFn: async (payload: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("followups")
        .update({ done: payload.done })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups"] });
      toast.success("Follow-up status updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFollowupMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("followups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups"] });
      toast.success("Follow-up reminder deleted.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFollowupMutation = useMutation({
    mutationFn: async (payload: {
      applicationId: string | null;
      recruiterId: string | null;
      dueAt: string;
      note: string;
    }) => {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { error } = await supabase.from("followups").insert({
        user_id: userId,
        application_id: payload.applicationId || null,
        recruiter_id: payload.recruiterId || null,
        due_at: payload.dueAt,
        note: payload.note,
        done: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups"] });
      setAddFollowupOpen(false);
      setNewFollowup({ applicationId: "", recruiterId: "", dueAt: "", note: "" });
      toast.success("Follow-up scheduled.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [addFollowupOpen, setAddFollowupOpen] = useState(false);
  const [newFollowup, setNewFollowup] = useState({
    applicationId: "",
    recruiterId: "",
    dueAt: "",
    note: "",
  });

  const campaignCards = useMemo(() => {
    const messagesById = new Map((messages.data ?? []).map((item) => [item.id, item]));
    const painPointsById = new Map((painPoints.data ?? []).map((item) => [item.id, item]));
    const researchByCompany = new Map(
      (research.data ?? []).map((item) => [item.company_name, item]),
    );

    return (campaigns.data ?? [])
      .map((campaign) => {
        const template = parseCampaignTemplate(campaign.template);
        const companyName =
          typeof template.companyName === "string" && template.companyName.trim()
            ? template.companyName
            : campaign.name.replace(/\s+campaign$/i, "");
        const draftIds =
          template.drafts && typeof template.drafts === "object"
            ? (template.drafts as Record<string, string>)
            : {};
        const coldEmail =
          typeof draftIds.cold_email === "string"
            ? (messagesById.get(draftIds.cold_email) ?? null)
            : null;
        const linkedinMessage =
          typeof draftIds.linkedin_message === "string"
            ? (messagesById.get(draftIds.linkedin_message) ?? null)
            : null;
        const loomScriptId =
          typeof template.loomScriptId === "string" ? template.loomScriptId : null;
        const loomScript =
          (loomScriptId
            ? (loomScripts.data ?? []).find((item) => item.id === loomScriptId)
            : null) ??
          (loomScripts.data ?? []).find((item) => item.company_name === companyName) ??
          null;
        const campaignPainPoints = Array.isArray(template.painPointIds)
          ? template.painPointIds
              .map((id) => painPointsById.get(String(id)))
              .filter((item): item is PainPointRow => Boolean(item))
          : (painPoints.data ?? []).filter((item) => item.company_name === companyName);

        return {
          campaign,
          companyName,
          summary: researchByCompany.get(companyName)?.summary ?? null,
          coldEmail,
          linkedinMessage,
          loomScript,
          painPoints: campaignPainPoints,
          recruiterId: typeof template.recruiterId === "string" ? template.recruiterId : null,
          resumeId: typeof template.resumeId === "string" ? template.resumeId : null,
        };
      })
      .filter((item) => {
        const haystack = [
          item.companyName,
          item.summary,
          item.coldEmail?.subject,
          item.linkedinMessage?.subject,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return !search.trim() || haystack.includes(search.trim().toLowerCase());
      });
  }, [campaigns.data, loomScripts.data, messages.data, painPoints.data, research.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outreach Campaign Studio"
        description="Generate email copy, DM copy, and Loom assets from the same company research, pain points, recruiter context, and primary resume."
      />

      {/* Follow-up Reminders Card */}
      <Card className="p-6 space-y-4 border border-accent-purple/10 bg-accent-purple/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-accent-purple" />
            <h2 className="text-lg font-semibold">Follow-up Reminders</h2>
            <Badge
              variant="secondary"
              className="bg-accent-purple/10 text-accent-purple border border-accent-purple/20"
            >
              {(followupsQuery.data ?? []).filter((f) => !f.done).length} pending
            </Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-accent-purple/20 hover:bg-accent-purple/10 text-accent-purple"
            onClick={() => setAddFollowupOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" /> Schedule Follow-up
          </Button>
        </div>

        <div className="grid gap-3 max-h-72 overflow-y-auto pr-2">
          {(followupsQuery.data ?? []).map((fu) => {
            const app = (applicationsQuery.data ?? []).find((a) => a.id === fu.application_id);
            const isOverdue = new Date(fu.due_at).getTime() < Date.now() && !fu.done;

            return (
              <div
                key={fu.id}
                className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
                  fu.done
                    ? "bg-muted/30 border-muted/50 opacity-70"
                    : isOverdue
                      ? "bg-destructive/10 border-destructive/20 text-destructive"
                      : "bg-card border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-input accent-accent-purple"
                    checked={fu.done}
                    onChange={(e) =>
                      toggleFollowupMutation.mutate({ id: fu.id, done: e.target.checked })
                    }
                  />
                  <div>
                    <div
                      className={`font-medium ${fu.done ? "line-through text-muted-foreground" : ""}`}
                    >
                      {fu.note || "Check outreach status"}
                    </div>
                    {app && (
                      <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                        Application: {app.company_name} — {app.role_title}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>
                        Due: {new Date(fu.due_at).toLocaleDateString()} at{" "}
                        {new Date(fu.due_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isOverdue && (
                        <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                          OVERDUE
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteFollowupMutation.mutate(fu.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          {(followupsQuery.data ?? []).length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg border-purple-500/20 bg-purple-500/5">
              No follow-ups scheduled yet. They are automatically generated when you submit
              applications.
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search companies or drafts…"
            />
          </div>
          <Button onClick={() => setGenerateOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate campaign
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        {campaignCards.map((card) => {
          const loomMetadata = (card.loomScript?.metadata ?? {}) as Record<
            string,
            string | string[]
          >;
          return (
            <Card key={card.campaign.id} className="space-y-4 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold">{card.companyName}</div>
                    <Badge variant="secondary">
                      {card.painPoints.length} pain point{card.painPoints.length === 1 ? "" : "s"}
                    </Badge>
                    {card.loomScript && <Badge variant="outline">Loom ready</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {card.summary ??
                      card.campaign.description ??
                      "No company summary stored for this campaign yet."}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {card.painPoints.map((point) => (
                      <Badge
                        key={point.id}
                        variant={point.severity >= 4 ? "destructive" : "secondary"}
                      >
                        {point.title}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={generateCampaignMutation.isPending}
                    onClick={() =>
                      generateCampaignMutation.mutate({
                        companyName: card.companyName,
                        resumeId: card.resumeId || defaultResumeId,
                        recruiterId: card.recruiterId || undefined,
                      })
                    }
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="email" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="email">Email copy</TabsTrigger>
                  <TabsTrigger value="dm">DM copy</TabsTrigger>
                  <TabsTrigger value="loom">Loom assets</TabsTrigger>
                </TabsList>

                <TabsContent value="email" className="space-y-3">
                  <MessagePanel
                    title="Cold email draft"
                    message={card.coldEmail}
                    onEdit={setEditing}
                  />
                </TabsContent>

                <TabsContent value="dm" className="space-y-3">
                  <MessagePanel
                    title="LinkedIn / recruiter DM"
                    message={card.linkedinMessage}
                    onEdit={setEditing}
                  />
                </TabsContent>

                <TabsContent value="loom" className="space-y-3">
                  <Card className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Loom script</div>
                        <div className="text-xs text-muted-foreground">
                          Visible workflow output from pain point → talking points → script.
                        </div>
                      </div>
                      {card.loomScript && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(card.loomScript?.script_text ?? "")}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy script
                        </Button>
                      )}
                    </div>
                    {card.loomScript ? (
                      <div className="grid gap-3 lg:grid-cols-2">
                        <InfoBlock title="Hook" value={String(loomMetadata.hook ?? "")} />
                        <InfoBlock
                          title="Problem statement"
                          value={String(loomMetadata.problem_statement ?? "")}
                        />
                        <InfoBlock
                          title="Solution pitch"
                          value={String(loomMetadata.solution_pitch ?? "")}
                        />
                        <InfoBlock title="CTA" value={String(loomMetadata.cta ?? "")} />
                        <div className="space-y-2 lg:col-span-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Full script
                          </div>
                          <Textarea rows={12} readOnly value={card.loomScript.script_text} />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No Loom asset is linked to this campaign yet.
                      </div>
                    )}
                  </Card>
                </TabsContent>
              </Tabs>
            </Card>
          );
        })}

        {!campaigns.isLoading && !campaignCards.length && (
          <Card className="p-8 text-center text-muted-foreground">
            No campaigns yet. Generate one from stored company research and pain points.
          </Card>
        )}
      </div>

      {generateOpen && (
        <Dialog open onOpenChange={(open) => !open && setGenerateOpen(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate outreach campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Company name *</Label>
                <Input
                  aria-label="Company name *"
                  list="company-options"
                  value={draft.companyName}
                  onChange={(event) => setDraft({ ...draft, companyName: event.target.value })}
                />
                <datalist id="company-options">
                  {(research.data ?? []).map((item) => (
                    <option key={item.company_name} value={item.company_name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Resume *</Label>
                <select
                  aria-label="Resume *"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={draft.resumeId}
                  onChange={(event) => setDraft({ ...draft, resumeId: event.target.value })}
                >
                  <option value="">Select resume</option>
                  {(resumes.data ?? []).map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.title}
                      {resume.is_primary ? " (Primary)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Recruiter (optional)</Label>
                <select
                  aria-label="Recruiter (optional)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={draft.recruiterId}
                  onChange={(event) => setDraft({ ...draft, recruiterId: event.target.value })}
                >
                  <option value="">Auto-select from company</option>
                  {(recruiters.data ?? [])
                    .filter(
                      (recruiter) =>
                        !draft.companyName ||
                        recruiter.company?.toLowerCase() === draft.companyName.toLowerCase(),
                    )
                    .map((recruiter) => (
                      <option key={recruiter.id} value={recruiter.id}>
                        {recruiter.name}
                        {recruiter.company ? ` · ${recruiter.company}` : ""}
                      </option>
                    ))}
                </select>
              </div>
              {!isSelectedCompanyHighTarget && (
                <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning border border-warning/20">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                  <span>
                    Strategic campaigns are gated to High Value Targets. Mark this company as a High
                    Value Target in Company Research to unlock.
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setGenerateOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  generateCampaignMutation.isPending ||
                  !draft.companyName.trim() ||
                  !draft.resumeId ||
                  !isSelectedCompanyHighTarget
                }
                onClick={() =>
                  generateCampaignMutation.mutate({
                    companyName: draft.companyName,
                    resumeId: draft.resumeId,
                    recruiterId: draft.recruiterId || undefined,
                  })
                }
              >
                <Video className="mr-2 h-4 w-4" />
                {generateCampaignMutation.isPending ? "Generating..." : "Generate full campaign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit outreach message</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input
                  value={editing.subject ?? ""}
                  onChange={(event) => setEditing({ ...editing, subject: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Body</Label>
                <Textarea
                  rows={12}
                  value={editing.body ?? ""}
                  onChange={(event) => setEditing({ ...editing, body: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editing.status}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      status: event.target.value as OutreachMessageRow["status"],
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="replied">Replied</option>
                  <option value="no_response">No response</option>
                  <option value="bounced">Bounced</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate(editing)}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {addFollowupOpen && (
        <Dialog open onOpenChange={(o) => !o && setAddFollowupOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Follow-up Reminder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Follow-up Note / Objective</Label>
                <Input
                  placeholder="e.g. Day 3 automated follow-up check"
                  value={newFollowup.note}
                  onChange={(e) => setNewFollowup({ ...newFollowup, note: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Associated Job Application</Label>
                <Select
                  value={newFollowup.applicationId || "none"}
                  onValueChange={(val) =>
                    setNewFollowup({ ...newFollowup, applicationId: val === "none" ? "" : val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select application (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(applicationsQuery.data ?? []).map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.company_name} — {app.role_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Follow-up Due Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={newFollowup.dueAt}
                  onChange={(e) => setNewFollowup({ ...newFollowup, dueAt: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddFollowupOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  createFollowupMutation.mutate({
                    applicationId: newFollowup.applicationId || null,
                    recruiterId: null,
                    dueAt: newFollowup.dueAt
                      ? new Date(newFollowup.dueAt).toISOString()
                      : new Date().toISOString(),
                    note: newFollowup.note,
                  });
                }}
                disabled={
                  createFollowupMutation.isPending || !newFollowup.note || !newFollowup.dueAt
                }
              >
                {createFollowupMutation.isPending ? "Scheduling..." : "Schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MessagePanel({
  title,
  message,
  onEdit,
}: {
  title: string;
  message: OutreachMessageRow | null;
  onEdit: (message: OutreachMessageRow) => void;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">
            Generated automatically from the active campaign context.
          </div>
        </div>
        {message && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyText([message.subject, message.body].filter(Boolean).join("\n\n"))}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(message)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </div>
        )}
      </div>
      {message ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject
            </div>
            <Input readOnly value={message.subject ?? ""} />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Body
            </div>
            <Textarea rows={12} readOnly value={message.body ?? ""} />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No draft is linked to this campaign yet.
        </div>
      )}
    </Card>
  );
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">
        {value || "Not stored yet."}
      </div>
    </div>
  );
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard.");
  } catch {
    toast.error("Clipboard write failed.");
  }
}
