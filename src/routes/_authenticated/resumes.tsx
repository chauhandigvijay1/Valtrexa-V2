import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { apiGet, apiPost } from "@/lib/api-client";
import { lineDelta } from "@/lib/workflow-intelligence";
import { toast } from "sonner";
import { Download, FileText, Sparkles, Star, Trash2, Upload, Wand2 } from "lucide-react";

const ACCEPT =
  ".pdf,.docx,.tex,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/x-tex";

type ResumeCenterRow = {
  id: string;
  title: string;
  is_primary: boolean | null;
  latestVersion: {
    id: string;
    file_name: string | null;
    storage_path: string | null;
    parse_status: string | null;
    parsed_text?: string | null;
    created_at: string;
  } | null;
  latestAnalysis: {
    id: string;
    ats_score: number;
    job_description: string;
    missing_keywords: string[];
    strengths: string[];
    weaknesses: string[];
    improvement_suggestions: string[];
    analysis?: Record<string, unknown> | null;
    created_at: string;
  } | null;
  latestTailored: {
    id: string;
    optimized_resume: string;
    ats_friendly_resume: string;
    missing_skills: string[];
    storage_path: string | null;
    pdf_storage_path?: string | null;
    pdf_file_size?: number | null;
    pdf_page_count?: number | null;
    pdf_verified?: boolean | null;
    job_description: string;
    created_at: string;
  } | null;
  parse: {
    full_name: string | null;
    skills: string[];
  } | null;
  processing_state: string;
};

type GenerationMode = "analyze" | "tailor";

export const Route = createFileRoute("/_authenticated/resumes")({ component: ResumesPage });

function ResumesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<{
    fileName: string;
    progress: number;
    stage: string;
  } | null>(null);
  const [generationDialog, setGenerationDialog] = useState<{
    resume: ResumeCenterRow;
    mode: GenerationMode;
  } | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [focusedResumeId, setFocusedResumeId] = useState<string | null>(null);

  const center = useQuery({
    queryKey: ["resume-center"],
    queryFn: () => apiGet<{ rows: ResumeCenterRow[] }>("/api/resumes/center"),
  });

  const refreshCenter = () => qc.invalidateQueries({ queryKey: ["resume-center"] });

  const openGenerationDialog = (resume: ResumeCenterRow, mode: GenerationMode) => {
    setFocusedResumeId(resume.id);
    setJobDescription(
      resume.latestAnalysis?.job_description ?? resume.latestTailored?.job_description ?? "",
    );
    setGenerationDialog({ resume, mode });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const storagePath = `${user.id}/resumes/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const title =
        file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim() || "Resume";

      const ticker = window.setInterval(() => {
        setUploadState((current) => {
          if (!current) return current;
          return { ...current, progress: Math.min(current.progress + 6, 82) };
        });
      }, 250);

      try {
        setUploadState({ fileName: file.name, progress: 8, stage: "Uploading resume" });
        const upload = await supabase.storage
          .from("resumes")
          .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
        if (upload.error) throw upload.error;

        setUploadState({ fileName: file.name, progress: 88, stage: "Parsing resume" });
        const result = await apiPost<{ resume: { id: string } }>("/api/resumes/process", {
          title,
          description: null,
          isPrimary: (center.data?.rows.length ?? 0) === 0,
          storagePath,
          fileName: file.name,
          fileType: file.type || ext,
          fileSizeBytes: file.size,
        });
        setFocusedResumeId(result.resume.id);
        setUploadState({ fileName: file.name, progress: 100, stage: "Ready" });
      } finally {
        window.clearInterval(ticker);
      }
    },
    onSuccess: async () => {
      await refreshCenter();
      toast.success("Resume uploaded and parsed.");
      window.setTimeout(() => setUploadState(null), 900);
    },
    onError: (error: Error) => {
      setUploadState(null);
      toast.error(error.message);
    },
  });

  const parseMutation = useMutation({
    mutationFn: async (resume: ResumeCenterRow) =>
      apiPost("/api/resumes/parse", {
        resumeId: resume.id,
        resumeVersionId: resume.latestVersion?.id,
      }),
    onSuccess: async (_, resume) => {
      setFocusedResumeId(resume.id);
      await refreshCenter();
      toast.success("Resume parsed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const primaryMutation = useMutation({
    mutationFn: async (resumeId: string) => apiPost("/api/resumes/primary", { resumeId }),
    onSuccess: async () => {
      await refreshCenter();
      toast.success("Primary resume updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (resumeId: string) => apiPost("/api/resumes/delete", { resumeId }),
    onSuccess: async () => {
      await refreshCenter();
      toast.success("Resume deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generationMutation = useMutation({
    mutationFn: async ({ resume, mode }: { resume: ResumeCenterRow; mode: GenerationMode }) =>
      apiPost(mode === "analyze" ? "/api/resumes/analyze" : "/api/resumes/tailor", {
        resumeId: resume.id,
        resumeVersionId: resume.latestVersion?.id,
        jobDescription,
      }),
    onSuccess: async (_, variables) => {
      await refreshCenter();
      setFocusedResumeId(variables.resume.id);
      setGenerationDialog(null);
      setJobDescription("");
      toast.success(
        variables.mode === "analyze" ? "ATS analysis completed." : "Tailored resume generated.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const summary = useMemo(() => {
    const rows = center.data?.rows ?? [];
    return {
      total: rows.length,
      primary: rows.find((row) => row.is_primary)?.title ?? "None",
      parsed: rows.filter((row) => row.processing_state === "completed").length,
      tailored: rows.filter((row) => !!row.latestTailored).length,
    };
  }, [center.data?.rows]);

  const browse = () => fileInputRef.current?.click();

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume Intelligence Center"
        description="Upload once, auto-sync your candidate data, mark a primary resume, and reuse it across matching and applications. Tailoring is optional."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Resumes" value={summary.total} />
        <MetricCard label="Parsed" value={summary.parsed} />
        <MetricCard label="Tailored Outputs" value={summary.tailored} />
        <MetricCard label="Primary" value={summary.primary} />
      </div>

      <Card
        className={`space-y-4 border-dashed p-6 ${dragActive ? "border-primary bg-primary/5" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="text-lg font-semibold">Upload Resume</div>
            <div className="text-sm text-muted-foreground">
              Supported formats: PDF, DOCX, TEX. Uploading triggers storage, resume parsing, and
              automatic sync into Candidate Brain, Skills, Projects, Experience, and Education.
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={browse}>
              Browse File
            </Button>
            <Button disabled={uploadMutation.isPending} onClick={browse}>
              <Upload className="mr-2 h-4 w-4" />
              {uploadMutation.isPending ? "Uploading..." : "Upload Resume"}
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            event.currentTarget.value = "";
          }}
        />
        {uploadState ? (
          <div className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between text-sm">
              <span>{uploadState.fileName}</span>
              <span className="text-muted-foreground">{uploadState.stage}</span>
            </div>
            <Progress value={uploadState.progress} className="h-2" />
          </div>
        ) : (
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Drag and drop a resume here, or browse from disk.
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {(center.data?.rows ?? []).map((resume) => {
          const analysisInsights = resume.latestAnalysis
            ? deriveAnalysisInsights(resume.latestAnalysis, resume.parse?.skills ?? [])
            : null;
          const tailoredDiff = resume.latestTailored
            ? lineDelta(
                resume.latestVersion?.parsed_text ?? "",
                resume.latestTailored.ats_friendly_resume,
              )
            : null;
          const showDetails =
            focusedResumeId === resume.id ||
            Boolean(resume.latestAnalysis) ||
            Boolean(resume.latestTailored);

          return (
            <Card
              key={resume.id}
              className={`space-y-4 p-5 ${focusedResumeId === resume.id ? "border-primary/50 shadow-sm" : ""}`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-lg font-semibold">{resume.title}</span>
                    {resume.is_primary && (
                      <Badge>
                        <Star className="mr-1 h-3.5 w-3.5" />
                        Primary
                      </Badge>
                    )}
                    <Badge variant="outline">{resume.processing_state}</Badge>
                    {resume.latestAnalysis && (
                      <Badge variant="secondary">ATS {resume.latestAnalysis.ats_score}%</Badge>
                    )}
                    {resume.latestTailored && <Badge variant="secondary">Tailored ready</Badge>}
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-4">
                    <Info
                      label="Filename"
                      value={resume.latestVersion?.file_name ?? "Not uploaded"}
                    />
                    <Info
                      label="Upload date"
                      value={
                        resume.latestVersion
                          ? new Date(resume.latestVersion.created_at).toLocaleString()
                          : "Not uploaded"
                      }
                    />
                    <Info label="Processing" value={resume.processing_state} />
                    <Info
                      label="ATS score"
                      value={
                        resume.latestAnalysis
                          ? `${resume.latestAnalysis.ats_score}%`
                          : "Not analyzed"
                      }
                    />
                  </div>
                  {resume.parse && (
                    <div className="text-sm text-muted-foreground">
                      Parsed profile: {resume.parse.full_name ?? "Name unavailable"}
                      {resume.parse.skills.length
                        ? ` • ${resume.parse.skills.slice(0, 8).join(", ")}`
                        : ""}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!resume.latestVersion || parseMutation.isPending}
                    onClick={() => parseMutation.mutate(resume)}
                  >
                    Parse
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!resume.latestVersion}
                    onClick={() => {
                      openGenerationDialog(resume, "analyze");
                    }}
                  >
                    ATS Analyze
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!resume.latestVersion}
                    onClick={() => {
                      openGenerationDialog(resume, "tailor");
                    }}
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    Tailor
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!resume.latestVersion && !resume.latestTailored}
                    onClick={() => downloadResume(resume)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    disabled={resume.is_primary || primaryMutation.isPending}
                    onClick={() => primaryMutation.mutate(resume.id)}
                  >
                    Mark Primary
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() =>
                      confirm("Delete this resume and all derived outputs?") &&
                      deleteMutation.mutate(resume.id)
                    }
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {showDetails && (
                <>
                  <Separator />
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="space-y-4 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">ATS Breakdown</div>
                          <div className="text-xs text-muted-foreground">
                            Visible immediately after analysis, with the latest job description
                            context.
                          </div>
                        </div>
                        <Badge variant={resume.latestAnalysis ? "secondary" : "outline"}>
                          {resume.latestAnalysis
                            ? `${resume.latestAnalysis.ats_score}%`
                            : "Run analysis"}
                        </Badge>
                      </div>
                      {resume.latestAnalysis && analysisInsights ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <MiniMetric
                              label="Keyword coverage"
                              value={`${analysisInsights.coverage}%`}
                            />
                            <MiniMetric
                              label="Matched skills"
                              value={analysisInsights.matchedSkills.length}
                            />
                            <MiniMetric
                              label="Missing skills"
                              value={resume.latestAnalysis.missing_keywords.length}
                            />
                          </div>
                          <Progress value={resume.latestAnalysis.ats_score} className="h-2" />
                          <div className="grid gap-3 md:grid-cols-2">
                            <TagBlock
                              title="Matched skills"
                              items={analysisInsights.matchedSkills}
                              empty="No explicit overlap captured yet."
                            />
                            <TagBlock
                              title="Missing skills"
                              items={resume.latestAnalysis.missing_keywords}
                              empty="No missing keywords recorded."
                              destructive
                            />
                            <ListBlock title="Strengths" items={resume.latestAnalysis.strengths} />
                            <ListBlock
                              title="Weaknesses"
                              items={resume.latestAnalysis.weaknesses}
                            />
                          </div>
                          <ListBlock
                            title="Recommendations"
                            items={resume.latestAnalysis.improvement_suggestions}
                          />
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Job description used
                            </div>
                            <Textarea
                              rows={6}
                              readOnly
                              value={resume.latestAnalysis.job_description}
                            />
                          </div>
                        </div>
                      ) : (
                        <EmptyState text="Run ATS Analyze to see keyword coverage, strengths, weaknesses, and recommendations here." />
                      )}
                    </Card>

                    <Card className="space-y-4 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Tailored Resume Output</div>
                          <div className="text-xs text-muted-foreground">
                            Preview, compare, and download the latest tailored version without
                            blocking the primary application flow.
                          </div>
                        </div>
                        <Badge variant={resume.latestTailored ? "secondary" : "outline"}>
                          {resume.latestTailored ? "Visible now" : "Generate first"}
                        </Badge>
                      </div>
                      {resume.latestTailored ? (
                        <Tabs defaultValue="preview" className="space-y-4">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="preview">Preview</TabsTrigger>
                            <TabsTrigger value="ats">ATS-ready</TabsTrigger>
                            <TabsTrigger value="compare">Compare</TabsTrigger>
                          </TabsList>
                          <TabsContent value="preview" className="space-y-3">
                            <TagBlock
                              title="Missing skills addressed"
                              items={resume.latestTailored.missing_skills}
                              empty="No explicit missing-skill list returned."
                            />
                            <div className="space-y-2">
                              {resume.latestTailored.storage_path?.endsWith(".tex") ? (
                                <div className="space-y-2">
                                  {resume.latestTailored.pdf_verified && (
                                    <div className="flex flex-wrap items-center gap-3 p-3 border border-success/20 bg-success/5 rounded-lg text-xs">
                                      <Badge className="bg-success/20 text-success border-success/30 flex items-center gap-1 font-bold">
                                        ✓ PDF Verified
                                      </Badge>
                                      <span className="text-muted-foreground">
                                        Size:{" "}
                                        <strong className="text-foreground">
                                          {(
                                            (resume.latestTailored.pdf_file_size ?? 0) / 1024
                                          ).toFixed(1)}{" "}
                                          KB
                                        </strong>
                                      </span>
                                      <span className="text-muted-foreground">
                                        Pages:{" "}
                                        <strong className="text-foreground">
                                          {resume.latestTailored.pdf_page_count ?? "N/A"}
                                        </strong>
                                      </span>
                                    </div>
                                  )}
                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    PDF Preview
                                  </div>
                                  <PdfPreview
                                    path={
                                      resume.latestTailored.pdf_storage_path ??
                                      resume.latestTailored.storage_path.replace(".tex", ".pdf")
                                    }
                                    bucket="tailored-resumes"
                                  />
                                </div>
                              ) : (
                                <>
                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Tailored resume version
                                  </div>
                                  <Textarea
                                    rows={14}
                                    readOnly
                                    value={resume.latestTailored.optimized_resume}
                                  />
                                </>
                              )}
                            </div>
                          </TabsContent>
                          <TabsContent value="ats" className="space-y-3">
                            <div className="space-y-2">
                              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                ATS-friendly preview
                              </div>
                              <Textarea
                                rows={14}
                                readOnly
                                value={resume.latestTailored.ats_friendly_resume}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Job description used
                              </div>
                              <Textarea
                                rows={6}
                                readOnly
                                value={resume.latestTailored.job_description}
                              />
                            </div>
                          </TabsContent>
                          <TabsContent value="compare" className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-2">
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Original parsed text
                                </div>
                                <Textarea
                                  rows={12}
                                  readOnly
                                  value={
                                    resume.latestVersion?.parsed_text ??
                                    "Original parsed text unavailable."
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Tailored ATS version
                                </div>
                                <Textarea
                                  rows={12}
                                  readOnly
                                  value={resume.latestTailored.ats_friendly_resume}
                                />
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <ListBlock
                                title="Added emphasis"
                                items={tailoredDiff?.added ?? []}
                                empty="No added lines captured."
                              />
                              <ListBlock
                                title="Removed or de-emphasized"
                                items={tailoredDiff?.removed ?? []}
                                empty="No removed lines captured."
                              />
                            </div>
                          </TabsContent>
                        </Tabs>
                      ) : (
                        <EmptyState text="Generate Tailor to see the tailored resume preview, ATS-ready version, and line-by-line comparison here." />
                      )}
                    </Card>
                  </div>
                </>
              )}
            </Card>
          );
        })}

        {!center.isLoading && (center.data?.rows.length ?? 0) === 0 && (
          <Card className="p-8 text-center text-muted-foreground">No resumes uploaded yet.</Card>
        )}
      </div>

      {generationDialog && (
        <Dialog open onOpenChange={(open) => !open && setGenerationDialog(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {generationDialog.mode === "analyze" ? "ATS Analyze" : "Generate Tailored Resume"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {generationDialog.resume.title} •{" "}
                {generationDialog.resume.latestVersion?.file_name ?? "No file"}
              </div>
              <Textarea
                aria-label="Job description"
                rows={12}
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the full job description here."
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setGenerationDialog(null)}>
                Cancel
              </Button>
              <Button
                disabled={generationMutation.isPending || !jobDescription.trim()}
                onClick={() => generationMutation.mutate(generationDialog)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {generationMutation.isPending
                  ? generationDialog.mode === "analyze"
                    ? "Analyzing..."
                    : "Generating..."
                  : generationDialog.mode === "analyze"
                    ? "Run ATS Analysis"
                    : "Generate Tailored Resume"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-foreground">{value}</div>
    </div>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {items.length ? (
        <ul className="space-y-1 text-sm text-foreground">
          {items.map((item) => (
            <li key={item} className="leading-6">
              • {item}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">{empty ?? "Nothing captured yet."}</div>
      )}
    </div>
  );
}

function TagBlock({
  title,
  items,
  empty,
  destructive,
}: {
  title: string;
  items: string[];
  empty?: string;
  destructive?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge key={item} variant={destructive ? "destructive" : "secondary"}>
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">{empty ?? "Nothing captured yet."}</div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function extractKeywords(jobDescription: string) {
  return Array.from(
    new Set(
      jobDescription
        .replace(/[^\w.+/#-]+/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2),
    ),
  );
}

function deriveAnalysisInsights(
  analysis: ResumeCenterRow["latestAnalysis"],
  parsedSkills: string[],
) {
  if (!analysis) return null;
  const jobKeywords = extractKeywords(analysis.job_description);
  const missing = new Set(analysis.missing_keywords.map(normalizeKeyword));
  const matchedKeywords = jobKeywords
    .filter((keyword) => !missing.has(normalizeKeyword(keyword)))
    .slice(0, 12);
  const matchedSkills = parsedSkills
    .filter((skill) => analysis.job_description.toLowerCase().includes(skill.toLowerCase()))
    .slice(0, 10);
  const coverageBase = Math.max(
    jobKeywords.length,
    matchedKeywords.length + analysis.missing_keywords.length,
  );
  const coverage = coverageBase
    ? Math.round((matchedKeywords.length / coverageBase) * 100)
    : analysis.ats_score;
  return {
    matchedKeywords,
    matchedSkills: matchedSkills.length ? matchedSkills : matchedKeywords,
    coverage,
  };
}

async function downloadResume(resume: ResumeCenterRow) {
  const tailoredPath =
    resume.latestTailored?.pdf_storage_path ??
    (resume.latestTailored?.storage_path?.endsWith(".pdf")
      ? resume.latestTailored.storage_path
      : null);
  const source = tailoredPath
    ? { bucket: "tailored-resumes", path: tailoredPath }
    : resume.latestVersion?.storage_path
      ? { bucket: "resumes", path: resume.latestVersion.storage_path }
      : null;

  if (!source) {
    toast.error("No PDF or primary resume file is available for download.");
    return;
  }

  const { data, error } = await supabase.storage
    .from(source.bucket)
    .createSignedUrl(source.path, 60 * 10);
  if (error || !data?.signedUrl) {
    toast.error(error?.message ?? "Failed to create download URL.");
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = data.signedUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

function PdfPreview({ path, bucket }: { path: string; bucket: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 10)
      .then(({ data }) => {
        if (data?.signedUrl) setUrl(data.signedUrl);
      });
  }, [path, bucket]);
  if (!url)
    return (
      <div className="p-4 text-center text-sm text-muted-foreground border rounded-lg">
        Loading preview...
      </div>
    );
  return <iframe src={url} className="w-full h-[600px] border rounded-lg" title="PDF Preview" />;
}
