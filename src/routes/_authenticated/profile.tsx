import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiPost } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { supabase } from "@/integrations/supabase/client";
import { expandRoleVariants, normalizeRoles } from "@/lib/role-taxonomy";
import { toast } from "sonner";
import {
  Brain,
  User,
  Link2,
  Target,
  BookOpen,
  Wrench,
  Briefcase,
  FolderGit2,
  Lightbulb,
  Plus,
  Trash2,
  Pencil,
  Calendar,
  Award,
  CheckSquare,
  Loader2,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

type ProfileData = {
  id?: string;
  user_id?: string;
  current_company?: string | null;
  current_title?: string | null;
  years_experience?: number | null;
  open_to_work?: boolean | null;
  summary?: string | null;
  preferred_roles?: string[] | null;
  preferred_locations?: string[] | null;
  remote_preference?: string | null;
  salary_expectation?: number | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  career_goal?: string | null;
  communication_style?: string | null;
};

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");

  // Dialog States
  const [expDialog, setExpDialog] = useState<any | null>(null);
  const [eduDialog, setEduDialog] = useState<any | null>(null);
  const [skillDialog, setSkillDialog] = useState<any | null>(null);
  const [projDialog, setProjDialog] = useState<any | null>(null);
  const [memoryDialog, setMemoryDialog] = useState<any | null>(null);
  const [certDialog, setCertDialog] = useState<any | null>(null);

  // Consolidated Query
  const brainQuery = useQuery({
    queryKey: ["candidate-brain", user?.id],
    enabled: !!user,
    queryFn: () => apiGet<any>("/api/candidate-brain"),
  });

  // Local state for profile inputs
  const [profileForm, setProfileForm] = useState<ProfileData>({});
  const [baseForm, setBaseForm] = useState({ name: "", email: "", phone: "", location: "" });

  useEffect(() => {
    if (brainQuery.data) {
      setProfileForm(brainQuery.data.profile || {});
      setBaseForm({
        name: brainQuery.data.baseProfile?.name ?? "",
        email: brainQuery.data.baseProfile?.email ?? "",
        phone: brainQuery.data.baseProfile?.phone ?? "",
        location: brainQuery.data.baseProfile?.location ?? "",
      });
    }
  }, [brainQuery.data]);

  // Consolidated Mutations
  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { id, created_at, updated_at, user_id, ...cleanPayload } = profileForm as any;
      const normalizedRoles = normalizeRoles(cleanPayload.preferred_roles ?? []);
      if (normalizedRoles.length < 5) {
        throw new Error("Select at least 5 preferred roles to improve matching coverage.");
      }
      await apiPost("/api/candidate-brain", {
        profile: {
          ...cleanPayload,
          preferred_roles: normalizedRoles,
        },
        baseProfile: baseForm,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      toast.success("Profile preferences saved successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveExperienceMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!user) throw new Error("Not authenticated");
      const current = brainQuery.data?.experiences ?? [];
      let updated;
      const { id, created_at, user_id, ...cleanPayload } = payload;
      if (id) {
        updated = current.map((exp: any) => (exp.id === id ? { ...exp, ...cleanPayload } : exp));
      } else {
        updated = [...current, cleanPayload];
      }
      await apiPost("/api/candidate-brain", { experiences: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      setExpDialog(null);
      toast.success("Experience saved successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteExperienceMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = brainQuery.data?.experiences ?? [];
      const updated = current.filter((exp: any) => exp.id !== id);
      await apiPost("/api/candidate-brain", { experiences: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      toast.success("Experience entry deleted.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveEducationMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!user) throw new Error("Not authenticated");
      const current = brainQuery.data?.education ?? [];
      let updated;
      const { id, created_at, user_id, ...cleanPayload } = payload;
      if (id) {
        updated = current.map((edu: any) => (edu.id === id ? { ...edu, ...cleanPayload } : edu));
      } else {
        updated = [...current, cleanPayload];
      }
      await apiPost("/api/candidate-brain", { education: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      setEduDialog(null);
      toast.success("Education saved successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteEducationMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = brainQuery.data?.education ?? [];
      const updated = current.filter((edu: any) => edu.id !== id);
      await apiPost("/api/candidate-brain", { education: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      toast.success("Education entry deleted.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveSkillMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!user) throw new Error("Not authenticated");
      const current = brainQuery.data?.skills ?? [];
      let updated;
      const { id, created_at, user_id, ...cleanPayload } = payload;
      if (id) {
        updated = current.map((sk: any) => (sk.id === id ? { ...sk, ...cleanPayload } : sk));
      } else {
        updated = [...current, cleanPayload];
      }
      await apiPost("/api/candidate-brain", { skills: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      setSkillDialog(null);
      toast.success("Skill saved successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSkillMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = brainQuery.data?.skills ?? [];
      const updated = current.filter((sk: any) => sk.id !== id);
      await apiPost("/api/candidate-brain", { skills: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      toast.success("Skill deleted.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveProjectMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!user) throw new Error("Not authenticated");
      const current = brainQuery.data?.projects ?? [];
      let updated;
      const { id, created_at, updated_at, user_id, ...cleanPayload } = payload;
      if (id) {
        updated = current.map((proj: any) =>
          proj.id === id ? { ...proj, ...cleanPayload } : proj,
        );
      } else {
        updated = [...current, cleanPayload];
      }
      await apiPost("/api/candidate-brain", { projects: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      setProjDialog(null);
      toast.success("Project saved successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = brainQuery.data?.projects ?? [];
      const updated = current.filter((proj: any) => proj.id !== id);
      await apiPost("/api/candidate-brain", { projects: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      toast.success("Project deleted.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveMemoryMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!user) throw new Error("Not authenticated");
      const current = brainQuery.data?.memory ?? [];
      let updated;
      const { id, created_at, updated_at, user_id, ...cleanPayload } = payload;
      if (id) {
        updated = current.map((mem: any) => (mem.id === id ? { ...mem, ...cleanPayload } : mem));
      } else {
        updated = [...current, cleanPayload];
      }
      await apiPost("/api/candidate-brain", { memory: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      setMemoryDialog(null);
      toast.success("Memory snippet saved!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = brainQuery.data?.memory ?? [];
      const updated = current.filter((mem: any) => mem.id !== id);
      await apiPost("/api/candidate-brain", { memory: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      toast.success("Memory snippet deleted.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveCertificationMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!user) throw new Error("Not authenticated");
      const current = brainQuery.data?.certifications ?? [];
      let updated;
      const { id, created_at, user_id, ...cleanPayload } = payload;
      if (id) {
        updated = current.map((cert: any) =>
          cert.id === id ? { ...cert, ...cleanPayload } : cert,
        );
      } else {
        updated = [...current, cleanPayload];
      }
      await apiPost("/api/candidate-brain", { certifications: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      setCertDialog(null);
      toast.success("Certification saved successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCertificationMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = brainQuery.data?.certifications ?? [];
      const updated = current.filter((cert: any) => cert.id !== id);
      await apiPost("/api/candidate-brain", { certifications: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-brain", user?.id] });
      toast.success("Certification entry deleted.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (brainQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidate Brain"
        description="AI-populated career registry. Centralized, structured, and editable."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-7 gap-2 bg-muted/30 p-1 rounded-lg">
          <TabsTrigger value="profile" className="flex items-center gap-1.5">
            <User className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="experiences" className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4" /> Work
          </TabsTrigger>
          <TabsTrigger value="education" className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" /> Education
          </TabsTrigger>
          <TabsTrigger value="skills" className="flex items-center gap-1.5">
            <Wrench className="h-4 w-4" /> Skills
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex items-center gap-1.5">
            <FolderGit2 className="h-4 w-4" /> Projects
          </TabsTrigger>
          <TabsTrigger value="certifications" className="flex items-center gap-1.5">
            <Award className="h-4 w-4" /> Certifications
          </TabsTrigger>
          <TabsTrigger value="memory" className="flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4" /> Memory
          </TabsTrigger>
        </TabsList>

        {/* PROFILE TAB */}
        <TabsContent value="profile" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-2 space-y-4">
              <CardHeader>
                <CardTitle>Profile Summary & Preferences</CardTitle>
                <CardDescription>
                  Configure target job details, expectations, and career goals.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Full Name</Label>
                    <Input
                      value={baseForm.name}
                      onChange={(e) => setBaseForm({ ...baseForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contact Email</Label>
                    <Input
                      value={baseForm.email}
                      onChange={(e) => setBaseForm({ ...baseForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location / Residence</Label>
                    <Input
                      value={baseForm.location}
                      onChange={(e) => setBaseForm({ ...baseForm, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input
                      value={baseForm.phone}
                      onChange={(e) => setBaseForm({ ...baseForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Remote Preference</Label>
                    <Select
                      value={profileForm.remote_preference ?? "hybrid"}
                      onValueChange={(val) =>
                        setProfileForm({ ...profileForm, remote_preference: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select preference" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="remote">Remote-only</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="onsite">On-site-only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Current Title</Label>
                    <Input
                      value={profileForm.current_title ?? ""}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, current_title: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Current Company</Label>
                    <Input
                      value={profileForm.current_company ?? ""}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, current_company: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Years of Experience</Label>
                    <Input
                      type="number"
                      value={profileForm.years_experience ?? 0}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, years_experience: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Salary Expectation (USD/Year)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 120000"
                      value={profileForm.salary_expectation ?? ""}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          salary_expectation: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5 flex items-center justify-between border rounded-md p-3 bg-muted/10">
                    <div>
                      <Label className="font-semibold text-sm">Open to Work</Label>
                      <div className="text-xs text-muted-foreground">
                        Display badge to recruiter discovery flows
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={profileForm.open_to_work ?? false}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, open_to_work: e.target.checked })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Professional Summary (Bio)</Label>
                  <Textarea
                    rows={4}
                    value={profileForm.summary ?? ""}
                    onChange={(e) => setProfileForm({ ...profileForm, summary: e.target.value })}
                    placeholder="Brief summary of professional experiences and impact..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Career Goals & Ambitions</Label>
                  <Textarea
                    rows={3}
                    value={profileForm.career_goal ?? ""}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, career_goal: e.target.value })
                    }
                    placeholder="Where do you see your career going next? Preferred technologies, leadership tracks..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Communication Style</Label>
                  <Input
                    value={(profileForm as any).communication_style ?? ""}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, communication_style: e.target.value })
                    }
                    placeholder="e.g. Concise and direct, technical, storytelling style"
                  />
                </div>

                <div className="grid gap-4">
                  <RoleMultiSelect
                    value={profileForm.preferred_roles ?? []}
                    onChange={(preferred_roles) =>
                      setProfileForm({ ...profileForm, preferred_roles })
                    }
                  />
                  <div className="space-y-1.5">
                    <Label>Preferred Locations (Comma-separated)</Label>
                    <Input
                      value={(profileForm.preferred_locations ?? []).join(", ")}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          preferred_locations: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g. San Francisco, CA, New York, NY"
                    />
                  </div>
                  <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                    Selected roles: {(profileForm.preferred_roles ?? []).length}. Expanded search
                    coverage:{" "}
                    {normalizeRoles(
                      (profileForm.preferred_roles ?? []).flatMap((role) =>
                        expandRoleVariants(role),
                      ),
                    ).join(", ") || "Choose roles to preview expansion."}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5">
                    <Link2 className="h-5 w-5 text-muted-foreground" /> Portals & Links
                  </CardTitle>
                  <CardDescription>Social profiles for job applications.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>GitHub Profile URL</Label>
                    <Input
                      value={profileForm.github_url ?? ""}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, github_url: e.target.value })
                      }
                      placeholder="https://github.com/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>LinkedIn Profile URL</Label>
                    <Input
                      value={profileForm.linkedin_url ?? ""}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, linkedin_url: e.target.value })
                      }
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Personal Portfolio URL</Label>
                    <Input
                      value={profileForm.portfolio_url ?? ""}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, portfolio_url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  size="lg"
                  className="w-full"
                  disabled={saveProfileMutation.isPending}
                  onClick={() => saveProfileMutation.mutate()}
                >
                  {saveProfileMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Save Profile Preferences
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* EXPERIENCES TAB */}
        <TabsContent value="experiences" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Work History</h2>
              <p className="text-sm text-muted-foreground">
                Manage your past jobs and descriptions.
              </p>
            </div>
            <Button
              onClick={() =>
                setExpDialog({
                  company: "",
                  title: "",
                  location: "",
                  start_date: "",
                  end_date: "",
                  is_current: false,
                  description: "",
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Add Experience
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {(brainQuery.data?.experiences ?? []).map((exp: any) => (
              <Card key={exp.id}>
                <CardHeader className="flex flex-row justify-between items-start pb-2">
                  <div>
                    <CardTitle className="text-base">{exp.title}</CardTitle>
                    <CardDescription className="font-semibold text-primary/80">
                      {exp.company} — {exp.location ?? "Remote"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setExpDialog(exp)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        confirm("Delete this experience entry?") &&
                        deleteExperienceMutation.mutate(exp.id)
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{exp.start_date ?? "Start Date"}</span> -{" "}
                    <span>{exp.is_current ? "Present" : (exp.end_date ?? "End Date")}</span>
                  </div>
                  {exp.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">
                      {exp.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            {(brainQuery.data?.experiences ?? []).length === 0 && (
              <div className="md:col-span-2 text-center py-12 border border-dashed rounded-lg text-muted-foreground">
                No work history entries found. Add your first job.
              </div>
            )}
          </div>
        </TabsContent>

        {/* EDUCATION TAB */}
        <TabsContent value="education" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Education History</h2>
              <p className="text-sm text-muted-foreground">
                List your degrees, certifications, and educational milestones.
              </p>
            </div>
            <Button
              onClick={() =>
                setEduDialog({
                  school: "",
                  degree: "",
                  field: "",
                  start_date: "",
                  end_date: "",
                  description: "",
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Add Education
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {(brainQuery.data?.education ?? []).map((edu: any) => (
              <Card key={edu.id}>
                <CardHeader className="flex flex-row justify-between items-start pb-2">
                  <div>
                    <CardTitle className="text-base">
                      {edu.degree
                        ? `${edu.degree} in ${edu.field ?? ""}`
                        : (edu.field ?? "Educational Entry")}
                    </CardTitle>
                    <CardDescription className="font-semibold text-primary/80">
                      {edu.school}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEduDialog(edu)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        confirm("Delete this education entry?") &&
                        deleteEducationMutation.mutate(edu.id)
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{edu.start_date ?? "Start Date"}</span> -{" "}
                    <span>{edu.end_date ?? "End Date"}</span>
                  </div>
                  {edu.description && (
                    <p className="text-sm text-muted-foreground">{edu.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {(brainQuery.data?.education ?? []).length === 0 && (
              <div className="md:col-span-2 text-center py-12 border border-dashed rounded-lg text-muted-foreground">
                No education history entries found. Add your first educational landmark.
              </div>
            )}
          </div>
        </TabsContent>

        {/* SKILLS TAB */}
        <TabsContent value="skills" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Skills Inventory</h2>
              <p className="text-sm text-muted-foreground">
                Manage your keywords and expertise levels.
              </p>
            </div>
            <Button
              onClick={() => setSkillDialog({ name: "", level: "intermediate", category: "" })}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Skill
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3">
                {(brainQuery.data?.skills ?? []).map((skill: any) => (
                  <Badge
                    key={skill.id}
                    variant="secondary"
                    className="pl-3 pr-2 py-1.5 text-sm flex items-center gap-2 border border-muted/50"
                  >
                    <span>{skill.name}</span>
                    <span className="text-[10px] uppercase font-bold opacity-60 px-1 bg-muted rounded">
                      {skill.level}
                    </span>
                    <button
                      className="hover:bg-destructive/20 rounded-full p-0.5"
                      onClick={() => deleteSkillMutation.mutate(skill.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </Badge>
                ))}
                {(brainQuery.data?.skills ?? []).length === 0 && (
                  <div className="w-full text-center py-12 text-muted-foreground">
                    No skills cataloged yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROJECTS TAB */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Personal & Professional Projects</h2>
              <p className="text-sm text-muted-foreground">
                Add and highlight key engineering achievements.
              </p>
            </div>
            <Button
              onClick={() =>
                setProjDialog({
                  name: "",
                  description: "",
                  github_url: "",
                  live_url: "",
                  tech_stack: [],
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Add Project
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {(brainQuery.data?.projects ?? []).map((proj: any) => (
              <Card key={proj.id}>
                <CardHeader className="flex flex-row justify-between items-start pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderGit2 className="h-4.5 w-4.5 text-muted-foreground" />
                      {proj.name}
                    </CardTitle>
                    <div className="flex gap-2 mt-1">
                      {proj.github_url && (
                        <a
                          href={proj.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          <Link2 className="h-3 w-3" /> GitHub
                        </a>
                      )}
                      {proj.live_url && (
                        <a
                          href={proj.live_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          <ExternalLink className="h-3 w-3" /> Live Demo
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setProjDialog(proj)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        confirm("Delete this project?") && deleteProjectMutation.mutate(proj.id)
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {proj.description && (
                    <p className="text-sm text-muted-foreground">{proj.description}</p>
                  )}
                  {proj.tech_stack && proj.tech_stack.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {proj.tech_stack.map((t: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0.5">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {(brainQuery.data?.projects ?? []).length === 0 && (
              <div className="md:col-span-2 text-center py-12 border border-dashed rounded-lg text-muted-foreground">
                No projects cataloged yet. Link your engineering highlights.
              </div>
            )}
          </div>
        </TabsContent>

        {/* MEMORY TAB */}
        <TabsContent value="memory" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Candidate AI Memory</h2>
              <p className="text-sm text-muted-foreground">
                Context snippets that guide the AI when building tailored outreach copy or interview
                tips.
              </p>
            </div>
            <Button
              onClick={() => setMemoryDialog({ topic: "", content: "", importance: 5, tags: [] })}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Memory Snippet
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {(brainQuery.data?.memory ?? []).map((mem: any) => (
              <Card key={mem.id}>
                <CardHeader className="flex flex-row justify-between items-start pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-1.5">
                      <Lightbulb className="h-4 w-4 text-accent-purple" />
                      {mem.topic}
                    </CardTitle>
                    <CardDescription>Importance: {mem.importance}/10</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setMemoryDialog(mem)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        confirm("Delete this memory snippet?") &&
                        deleteMemoryMutation.mutate(mem.id)
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{mem.content}</p>
                  {mem.tags && mem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {mem.tags.map((t: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {(brainQuery.data?.memory ?? []).length === 0 && (
              <div className="md:col-span-2 text-center py-12 border border-dashed rounded-lg text-muted-foreground">
                No memory snippets stored yet. Storing facts helps tailor better cover letters and
                messages.
              </div>
            )}
          </div>
        </TabsContent>

        {/* CERTIFICATIONS TAB */}
        <TabsContent value="certifications" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Certifications</h2>
              <p className="text-sm text-muted-foreground">
                Manage your credentials, licenses, and verified certifications.
              </p>
            </div>
            <Button onClick={() => setCertDialog({ name: "", issuer: "", date: "", summary: "" })}>
              <Plus className="mr-2 h-4 w-4" /> Add Certification
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {(brainQuery.data?.certifications ?? []).map((cert: any) => (
              <Card key={cert.id}>
                <CardHeader className="flex flex-row justify-between items-start pb-2">
                  <div>
                    <CardTitle className="text-base">{cert.name}</CardTitle>
                    <CardDescription className="font-semibold text-primary/80">
                      {cert.issuer || "Unknown Issuer"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setCertDialog(cert)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        confirm("Delete this certification entry?") &&
                        deleteCertificationMutation.mutate(cert.id)
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{cert.date || "No Date"}</span>
                  </div>
                  {cert.summary && <p className="text-sm text-muted-foreground">{cert.summary}</p>}
                </CardContent>
              </Card>
            ))}
            {(brainQuery.data?.certifications ?? []).length === 0 && (
              <div className="md:col-span-2 text-center py-12 border border-dashed rounded-lg text-muted-foreground">
                No certifications cataloged yet.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* DIALOGS FOR CRUD OPERATIONS */}

      {/* Experience Dialog */}
      {expDialog && (
        <Dialog open onOpenChange={(o) => !o && setExpDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{expDialog.id ? "Edit Experience" : "Add Experience"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Job Title</Label>
                  <Input
                    value={expDialog.title}
                    onChange={(e) => setExpDialog({ ...expDialog, title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company Name</Label>
                  <Input
                    value={expDialog.company}
                    onChange={(e) => setExpDialog({ ...expDialog, company: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input
                  placeholder="e.g. San Francisco, CA (or Remote)"
                  value={expDialog.location ?? ""}
                  onChange={(e) => setExpDialog({ ...expDialog, location: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input
                    placeholder="e.g. 2021-03"
                    value={expDialog.start_date ?? ""}
                    onChange={(e) => setExpDialog({ ...expDialog, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input
                    placeholder="e.g. 2023-08"
                    disabled={expDialog.is_current}
                    value={expDialog.end_date ?? ""}
                    onChange={(e) => setExpDialog({ ...expDialog, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="exp-current"
                  checked={expDialog.is_current ?? false}
                  onChange={(e) =>
                    setExpDialog({
                      ...expDialog,
                      is_current: e.target.checked,
                      end_date: e.target.checked ? null : expDialog.end_date,
                    })
                  }
                />
                <Label htmlFor="exp-current">I currently work here</Label>
              </div>
              <div className="space-y-1.5">
                <Label>Description / Key Outcomes</Label>
                <Textarea
                  rows={5}
                  value={expDialog.description ?? ""}
                  onChange={(e) => setExpDialog({ ...expDialog, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setExpDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveExperienceMutation.mutate(expDialog)}
                disabled={saveExperienceMutation.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Education Dialog */}
      {eduDialog && (
        <Dialog open onOpenChange={(o) => !o && setEduDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{eduDialog.id ? "Edit Education" : "Add Education"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>School / University</Label>
                <Input
                  value={eduDialog.school}
                  onChange={(e) => setEduDialog({ ...eduDialog, school: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Degree</Label>
                  <Input
                    placeholder="e.g. Bachelor of Science"
                    value={eduDialog.degree ?? ""}
                    onChange={(e) => setEduDialog({ ...eduDialog, degree: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Field of Study</Label>
                  <Input
                    placeholder="e.g. Computer Science"
                    value={eduDialog.field ?? ""}
                    onChange={(e) => setEduDialog({ ...eduDialog, field: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input
                    placeholder="e.g. 2017-09"
                    value={eduDialog.start_date ?? ""}
                    onChange={(e) => setEduDialog({ ...eduDialog, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date / Graduation</Label>
                  <Input
                    placeholder="e.g. 2021-06"
                    value={eduDialog.end_date ?? ""}
                    onChange={(e) => setEduDialog({ ...eduDialog, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes / Activities</Label>
                <Textarea
                  rows={3}
                  value={eduDialog.description ?? ""}
                  onChange={(e) => setEduDialog({ ...eduDialog, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEduDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveEducationMutation.mutate(eduDialog)}
                disabled={saveEducationMutation.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Skill Dialog */}
      {skillDialog && (
        <Dialog open onOpenChange={(o) => !o && setSkillDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{skillDialog.id ? "Edit Skill" : "Add Skill"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Skill Name</Label>
                <Input
                  value={skillDialog.name}
                  onChange={(e) => setSkillDialog({ ...skillDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input
                  placeholder="e.g. Frontend, DevOps, Languages"
                  value={skillDialog.category ?? ""}
                  onChange={(e) => setSkillDialog({ ...skillDialog, category: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Proficiency Level</Label>
                <Select
                  value={skillDialog.level}
                  onValueChange={(val: any) => setSkillDialog({ ...skillDialog, level: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSkillDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveSkillMutation.mutate(skillDialog)}
                disabled={saveSkillMutation.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Project Dialog */}
      {projDialog && (
        <Dialog open onOpenChange={(o) => !o && setProjDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{projDialog.id ? "Edit Project" : "Add Project"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Project Name</Label>
                <Input
                  value={projDialog.name}
                  onChange={(e) => setProjDialog({ ...projDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={projDialog.description ?? ""}
                  onChange={(e) => setProjDialog({ ...projDialog, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>GitHub URL</Label>
                  <Input
                    value={projDialog.github_url ?? ""}
                    onChange={(e) => setProjDialog({ ...projDialog, github_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Live Demo URL</Label>
                  <Input
                    value={projDialog.live_url ?? ""}
                    onChange={(e) => setProjDialog({ ...projDialog, live_url: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tech Stack (Comma-separated)</Label>
                <Input
                  value={(projDialog.tech_stack ?? []).join(", ")}
                  onChange={(e) =>
                    setProjDialog({
                      ...projDialog,
                      tech_stack: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setProjDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveProjectMutation.mutate(projDialog)}
                disabled={saveProjectMutation.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Memory Dialog */}
      {memoryDialog && (
        <Dialog open onOpenChange={(o) => !o && setMemoryDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {memoryDialog.id ? "Edit Memory Snippet" : "Add Memory Snippet"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Topic / Fact Title</Label>
                <Input
                  placeholder="e.g. My leadership style"
                  value={memoryDialog.topic}
                  onChange={(e) => setMemoryDialog({ ...memoryDialog, topic: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Memory Content</Label>
                <Textarea
                  rows={4}
                  placeholder="Describe the facts or narrative you want the AI to remember..."
                  value={memoryDialog.content}
                  onChange={(e) => setMemoryDialog({ ...memoryDialog, content: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Importance Level (1-10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={memoryDialog.importance ?? 5}
                    onChange={(e) =>
                      setMemoryDialog({ ...memoryDialog, importance: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tags (Comma-separated)</Label>
                  <Input
                    placeholder="e.g. work, preference, soft-skills"
                    value={(memoryDialog.tags ?? []).join(", ")}
                    onChange={(e) =>
                      setMemoryDialog({
                        ...memoryDialog,
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMemoryDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveMemoryMutation.mutate(memoryDialog)}
                disabled={saveMemoryMutation.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Certification Dialog */}
      {certDialog && (
        <Dialog open onOpenChange={(o) => !o && setCertDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {certDialog.id ? "Edit Certification" : "Add Certification"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Certification Name</Label>
                <Input
                  value={certDialog.name}
                  onChange={(e) => setCertDialog({ ...certDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Issuer</Label>
                <Input
                  value={certDialog.issuer ?? ""}
                  onChange={(e) => setCertDialog({ ...certDialog, issuer: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  placeholder="e.g. 2023-05"
                  value={certDialog.date ?? ""}
                  onChange={(e) => setCertDialog({ ...certDialog, date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Summary / Notes</Label>
                <Textarea
                  rows={3}
                  value={certDialog.summary ?? ""}
                  onChange={(e) => setCertDialog({ ...certDialog, summary: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCertDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveCertificationMutation.mutate(certDialog)}
                disabled={saveCertificationMutation.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
