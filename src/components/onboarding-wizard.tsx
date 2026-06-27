import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { toast } from "sonner";
import {
  Upload,
  Brain,
  ListChecks,
  Target,
  MapPin,
  Link2,
  MessageSquare,
  Settings,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

export type OnboardingWizardProps = {
  mode?: "modal" | "page";
  onComplete?: () => void;
};

type CandidateProfile = {
  id: string;
  current_title: string | null;
  current_company: string | null;
  years_experience: number | null;
  summary: string | null;
  preferred_roles: string[] | null;
  preferred_locations: string[] | null;
  salary_expectation: number | null;
  github_url: string | null;
  linkedin_url: string | null;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
  skills: any[];
  projects: any[];
  experiences: any[];
};

const STEPS = [
  {
    id: "resume",
    label: "Upload Resume",
    icon: Upload,
    description: "Start by uploading your resume",
  },
  {
    id: "brain",
    label: "Review Brain",
    icon: Brain,
    description: "Review your parsed Candidate Brain",
  },
  {
    id: "missing",
    label: "Missing Info",
    icon: ListChecks,
    description: "Fill in any missing fields",
  },
  {
    id: "roles",
    label: "Target Roles",
    icon: Target,
    description: "Select roles you're targeting",
  },
  {
    id: "locations",
    label: "Locations",
    icon: MapPin,
    description: "Set your preferred locations",
  },
  {
    id: "providers",
    label: "Connections",
    icon: Link2,
    description: "Connect job provider accounts",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: MessageSquare,
    description: "Link your Telegram account",
  },
  {
    id: "preferences",
    label: "Workflow Prefs",
    icon: Settings,
    description: "Configure your workflow",
  },
  { id: "ready", label: "Ready", icon: CheckCircle2, description: "You're all set!" },
];

export function OnboardingWizard({ mode = "modal", onComplete }: OnboardingWizardProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["candidate-brain", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("candidate_profiles" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as CandidateProfile | null;
    },
    enabled: !!user,
  });

  const [roles, setRoles] = useState<string[]>(profile?.preferred_roles ?? []);
  const [locations, setLocations] = useState<string[]>(profile?.preferred_locations ?? []);
  const [salary, setSalary] = useState<string>(profile?.salary_expectation?.toString() ?? "");
  const [summary, setSummary] = useState<string>(profile?.summary ?? "");
  const [github, setGithub] = useState<string>(profile?.github_url ?? "");
  const [linkedin, setLinkedin] = useState<string>(profile?.linkedin_url ?? "");

  const saveStep = useMutation({
    mutationFn: async (stepNumber: number) => {
      if (!user) return;
      const payload: any = {};
      if (stepNumber >= 3) payload.preferred_roles = roles;
      if (stepNumber >= 4) payload.preferred_locations = locations;
      if (salary) payload.salary_expectation = parseFloat(salary) || null;
      if (summary) payload.summary = summary;
      if (github) payload.github_url = github;
      if (linkedin) payload.linkedin_url = linkedin;
      payload.onboarding_step = stepNumber;
      if (stepNumber >= 8) payload.onboarding_completed_at = new Date().toISOString();
      await supabase
        .from("candidate_profiles" as any)
        .update(payload)
        .eq("user_id", user.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain"] });
    },
  });

  if (isLoading || !profile) return null;
  if (!mode || mode === "modal") {
    if (dismissed) return null;
    if ((profile.onboarding_step ?? 0) >= 9) return null;
  }

  const currentStep = STEPS[step];
  const showStep = Math.max(step, profile.onboarding_step ?? 0);

  const next = async () => {
    await saveStep.mutateAsync(step + 1);
    if (step >= 8) {
      if (mode === "page") {
        onComplete?.();
      } else {
        setDismissed(true);
      }
      toast.success("Onboarding complete! 🎉");
      return;
    }
    setStep((s) => Math.min(s + 1, 8));
  };

  const skip = async () => {
    if (step < 8) {
      await saveStep.mutateAsync(9);
      setDismissed(true);
    }
  };

  const wizardContent = (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Welcome to VALTREXA-V2</h2>
          <p className="text-sm text-muted-foreground">Let's get your career OS set up</p>
        </div>
        <Badge variant="secondary">
          {step + 1} / {STEPS.length}
        </Badge>
      </div>

      <Progress value={((step + 1) / STEPS.length) * 100} className="mb-6" />

      <div className="mb-6">
        {/* Step indicator */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
              }`}
            >
              <s.icon className="h-3 w-3" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[200px]">
          {step === 0 && (
            <div className="text-center py-8">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <h3 className="text-lg font-medium mb-2">Upload Your Resume</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Go to the Resume Center to upload your resume. VALTREXA-V2 will parse it and build
                your Candidate Brain automatically.
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => (window.location.href = "/resumes")}>
                  Go to Resume Center
                </Button>
              </div>
              {profile?.current_title && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Detected: {profile.current_title} @ {profile.current_company ?? "N/A"}
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="py-4">
              <h3 className="text-lg font-medium mb-2">Your Candidate Brain</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Review the parsed information. You can edit anything later in your Profile.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Title</span>
                  <p>{profile.current_title ?? "Not set"}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Company</span>
                  <p>{profile.current_company ?? "Not set"}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Experience</span>
                  <p>{profile.years_experience ?? 0} years</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Skills</span>
                  <p>{(profile.skills ?? []).length} skills</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Projects</span>
                  <p>{(profile.projects ?? []).length}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Experience</span>
                  <p>{(profile.experiences ?? []).length} entries</p>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="py-4 space-y-4">
              <h3 className="text-lg font-medium">Missing Information</h3>
              <p className="text-sm text-muted-foreground">
                Fill in any details that weren't extracted from your resume.
              </p>
              <div className="space-y-3">
                <div>
                  <Label>Professional Summary</Label>
                  <Textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Brief summary of your career goals and expertise"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>GitHub URL</Label>
                    <Input
                      value={github}
                      onChange={(e) => setGithub(e.target.value)}
                      placeholder="https://github.com/yourname"
                    />
                  </div>
                  <div>
                    <Label>LinkedIn URL</Label>
                    <Input
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      placeholder="https://linkedin.com/in/yourname"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="py-4">
              <h3 className="text-lg font-medium mb-2">Target Roles</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Select the roles you're targeting. The system will match jobs against these
                preferences.
              </p>
              <RoleMultiSelect value={roles} onChange={setRoles} />
            </div>
          )}

          {step === 4 && (
            <div className="py-4 space-y-4">
              <h3 className="text-lg font-medium">Preferred Locations</h3>
              <p className="text-sm text-muted-foreground">Enter your preferred work locations.</p>
              <div className="flex gap-2 flex-wrap">
                {locations.map((l, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {l}
                    <button
                      onClick={() => setLocations(locations.filter((_, j) => j !== i))}
                      className="hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a location (e.g., Remote, San Francisco)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                      setLocations([...locations, (e.target as HTMLInputElement).value.trim()]);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
              <div>
                <Label>Expected Salary (optional)</Label>
                <Input
                  type="number"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="e.g., 120000"
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center py-8">
              <Link2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <h3 className="text-lg font-medium mb-2">Connect Providers</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Go to Settings to connect your job provider accounts. LinkedIn, Indeed, Naukri,
                Wellfound, and Instahyre are supported.
              </p>
              <Button variant="outline" onClick={() => (window.location.href = "/settings")}>
                Open Settings
              </Button>
            </div>
          )}

          {step === 6 && (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <h3 className="text-lg font-medium mb-2">Connect Telegram</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Link your Telegram to receive real-time notifications about applications, approvals,
                and workflow updates.
              </p>
              <p className="text-xs text-muted-foreground">
                Send <code className="bg-muted px-1 rounded">/connect</code> to your bot to link
                your account.
              </p>
            </div>
          )}

          {step === 7 && (
            <div className="py-4">
              <h3 className="text-lg font-medium mb-2">Workflow Preferences</h3>
              <p className="text-sm text-muted-foreground mb-4">The workflow will automatically:</p>
              <ul className="space-y-2 text-sm">
                {[
                  "Import jobs from connected providers",
                  "Match jobs against your Candidate Brain",
                  "Create applications for matched jobs",
                  "Discover recruiters at target companies",
                  "Generate outreach drafts for approval",
                  "Track follow-ups and health checks",
                  "Sync notifications to Telegram",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 8 && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-medium mb-2">You're All Set!</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your Career OS is ready. Start the workflow from the Workflow Timeline page.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStep((s) => Math.max(s - 1, 0))}
          disabled={step === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={skip}>
            Skip all
          </Button>
          <Button size="sm" onClick={next} disabled={saveStep.isPending}>
            {step >= 8 ? "Get Started" : "Continue"}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </>
  );

  if (mode === "page") {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <Card className="p-6 shadow-xl">{wizardContent}</Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <Card className="w-full max-w-2xl mx-4 p-6 shadow-xl">{wizardContent}</Card>
    </div>
  );
}
