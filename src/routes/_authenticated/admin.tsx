import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  RefreshCw,
  Play,
  Pause,
  StopCircle,
  Users,
  Briefcase,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — VALTREXA-V2" }] }),
  component: AdminPage,
});

type ProfileRow = {
  id: string;
  user_id: string;
  current_title: string | null;
  current_company: string | null;
  preferred_roles: string[] | null;
  onboarding_step: number | null;
};
type WfState = {
  id: string;
  user_id: string;
  status: string;
  cycle_id: string | null;
  error: string | null;
  updated_at: string;
};

type InspectData = {
  profile: Record<string, any> | null;
  candidateProfile: Record<string, any> | null;
  applications: Record<string, any>[];
  workflowState: Record<string, any> | null;
  telegramBinding: Record<string, any> | null;
  providers: Record<string, any>[];
};

function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [impersonateUser, setImpersonateUser] = useState<ProfileRow | null>(null);

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("candidate_profiles").select("*").limit(50);
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: wfStates = [] } = useQuery({
    queryKey: ["admin", "workflow-states"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("workflow_state").select("*").limit(50);
      return (data ?? []) as WfState[];
    },
  });

  const { data: controls = [] } = useQuery({
    queryKey: ["admin", "provider-controls"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("provider_controls").select("*");
      return (data ?? []) as any[];
    },
  });

  const { data: queueJobs = [] } = useQuery({
    queryKey: ["admin", "queue-jobs"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("queue_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
  });

  const { data: inspectData, isLoading: inspectLoading } = useQuery({
    queryKey: ["admin", "user-inspect", impersonateUser?.user_id],
    queryFn: async () => {
      if (!impersonateUser) return null;
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`/api/admin/users/${impersonateUser.user_id}/inspect`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch user data");
      return res.json() as Promise<InspectData>;
    },
    enabled: !!impersonateUser?.user_id,
  });

  const toggleProvider = useMutation({
    mutationFn: async ({ provider, status }: { provider: string; status: string }) => {
      await (supabase as any)
        .from("provider_controls")
        .upsert({ provider, status, updated_at: new Date().toISOString() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "provider-controls"] });
      toast.success("Provider updated");
    },
  });

  return (
    <div>
      <PageHeader title="Admin Dashboard" description="System-wide monitoring and control" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" /> Users
              </div>
              <div className="text-2xl font-semibold mt-1">{profiles.length}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Activity className="h-4 w-4" /> Workflows Active
              </div>
              <div className="text-2xl font-semibold mt-1">
                {wfStates.filter((s) => s.status === "running").length}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Briefcase className="h-4 w-4" /> Providers Enabled
              </div>
              <div className="text-2xl font-semibold mt-1">
                {controls.filter((c) => c.status === "enabled").length}/{controls.length}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <AlertTriangle className="h-4 w-4" /> Queue Pending
              </div>
              <div className="text-2xl font-semibold mt-1">
                {queueJobs.filter((j) => j.status === "pending" || j.status === "active").length}
              </div>
            </Card>
          </div>
          <Card className="p-4">
            <h3 className="text-sm font-medium mb-3">Recent Queue Jobs</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueJobs.slice(0, 10).map((j: any) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-xs">{j.queue ?? j.type ?? "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          j.status === "completed"
                            ? "default"
                            : j.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {j.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{j.attempts ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(j.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {queueJobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No queue jobs
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Onboarding</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const ws = wfStates.find((s) => s.user_id === p.user_id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{p.current_title ?? "-"}</TableCell>
                      <TableCell className="text-xs">{p.current_company ?? "-"}</TableCell>
                      <TableCell className="text-xs">
                        {(p.preferred_roles ?? []).length} roles
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.onboarding_step && p.onboarding_step >= 9 ? "default" : "secondary"
                          }
                        >
                          {p.onboarding_step ?? 0}/9
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ws?.status === "running"
                              ? "default"
                              : ws?.status === "paused"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {ws?.status ?? "stopped"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setImpersonateUser(p)}
                          >
                            Inspect
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="providers">
          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Health Check</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controls.map((c: any) => (
                  <TableRow key={c.provider ?? c.id}>
                    <TableCell className="font-medium">{c.provider}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            c.status === "enabled"
                              ? "default"
                              : c.status === "paused"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {c.status}
                        </Badge>
                        {c.last_health_check_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.last_health_check_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.last_health_check_at
                        ? new Date(c.last_health_check_at).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {c.status !== "enabled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              toggleProvider.mutate({ provider: c.provider, status: "enabled" })
                            }
                          >
                            Enable
                          </Button>
                        )}
                        {c.status === "enabled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              toggleProvider.mutate({ provider: c.provider, status: "paused" })
                            }
                          >
                            Pause
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            toggleProvider.mutate({ provider: c.provider, status: "disabled" })
                          }
                        >
                          Disable
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {controls.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No provider controls configured
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueJobs.map((j: any) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-xs">{j.queue ?? j.type ?? "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          j.status === "completed"
                            ? "default"
                            : j.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {j.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {j.attempts ?? 0}/{j.max_attempts ?? 3}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {j.error ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(j.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {queueJobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No queue items
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="workflow">
          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wfStates.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      {s.user_id.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {s.status === "running" ? (
                          <Activity className="h-3 w-3 text-green-500" />
                        ) : s.status === "paused" ? (
                          <Pause className="h-3 w-3 text-yellow-500" />
                        ) : (
                          <StopCircle className="h-3 w-3 text-muted-foreground" />
                        )}
                        <Badge
                          variant={
                            s.status === "running"
                              ? "default"
                              : s.status === "paused"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {s.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[10px]">
                      {s.cycle_id?.substring(0, 12) ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                      {s.error ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.updated_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {wfStates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No workflow states
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!impersonateUser} onOpenChange={(o) => !o && setImpersonateUser(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Inspection</DialogTitle>
            <DialogDescription>Read-only view of user profile data</DialogDescription>
          </DialogHeader>
          {impersonateUser && inspectLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading user data...
            </div>
          )}
          {impersonateUser && inspectData && !inspectLoading && (
            <div className="space-y-4 text-sm">
              {/* Profile */}
              <div>
                <h4 className="font-semibold text-base mb-1">Profile</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>
                    <span className="font-medium">ID:</span>{" "}
                    <code className="text-xs">{inspectData.profile?.id ?? "-"}</code>
                  </div>
                  <div>
                    <span className="font-medium">Name:</span> {inspectData.profile?.name ?? "-"}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span> {inspectData.profile?.email ?? "-"}
                  </div>
                  <div>
                    <span className="font-medium">Location:</span>{" "}
                    {inspectData.profile?.location ?? "-"}
                  </div>
                  <div>
                    <span className="font-medium">Bio:</span> {inspectData.profile?.bio ?? "-"}
                  </div>
                </div>
              </div>
              <hr />
              {/* Candidate Brain */}
              <div>
                <h4 className="font-semibold text-base mb-1">Candidate Brain</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>
                    <span className="font-medium">Title:</span>{" "}
                    {inspectData.candidateProfile?.current_title ?? "-"}
                  </div>
                  <div>
                    <span className="font-medium">Company:</span>{" "}
                    {inspectData.candidateProfile?.current_company ?? "-"}
                  </div>
                  <div>
                    <span className="font-medium">Experience:</span>{" "}
                    {inspectData.candidateProfile?.experience ?? "-"}
                  </div>
                  <div>
                    <span className="font-medium">Skills:</span>{" "}
                    {(inspectData.candidateProfile?.skills ?? []).length}
                  </div>
                  <div>
                    <span className="font-medium">Onboarding Step:</span>{" "}
                    {inspectData.candidateProfile?.onboarding_step ?? 0}/9
                  </div>
                  <div>
                    <span className="font-medium">Roles:</span>{" "}
                    {(inspectData.candidateProfile?.preferred_roles ?? []).join(", ") || "None"}
                  </div>
                </div>
              </div>
              <hr />
              {/* Applications */}
              <div>
                <h4 className="font-semibold text-base mb-1">
                  Applications ({inspectData.applications.length})
                </h4>
                {inspectData.applications.length === 0 ? (
                  <p className="text-muted-foreground">No applications found</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {inspectData.applications.map((app: any) => (
                      <Badge key={app.id} variant="outline" className="text-[10px]">
                        {app.status ?? "unknown"}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <hr />
              {/* Workflow State */}
              <div>
                <h4 className="font-semibold text-base mb-1">Workflow State</h4>
                {inspectData.workflowState ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div>
                      <span className="font-medium">Status:</span>{" "}
                      <Badge
                        variant={
                          inspectData.workflowState.status === "running" ? "default" : "secondary"
                        }
                      >
                        {inspectData.workflowState.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-medium">Cycle:</span>{" "}
                      <code className="text-xs">{inspectData.workflowState.cycle_id ?? "-"}</code>
                    </div>
                    <div>
                      <span className="font-medium">Error:</span>{" "}
                      <span className="text-destructive">
                        {inspectData.workflowState.error ?? "None"}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Updated:</span>{" "}
                      {new Date(inspectData.workflowState.updated_at).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No workflow state</p>
                )}
              </div>
              <hr />
              {/* Telegram Binding */}
              <div>
                <h4 className="font-semibold text-base mb-1">Telegram</h4>
                {inspectData.telegramBinding ? (
                  <div>
                    <span className="font-medium">Chat ID:</span>{" "}
                    <code className="text-xs">{inspectData.telegramBinding.chat_id ?? "-"}</code>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Not bound</p>
                )}
              </div>
              <hr />
              {/* Provider Statuses */}
              <div>
                <h4 className="font-semibold text-base mb-1">
                  Providers ({inspectData.providers.length})
                </h4>
                {inspectData.providers.length === 0 ? (
                  <p className="text-muted-foreground">No provider controls</p>
                ) : (
                  <div className="space-y-1">
                    {inspectData.providers.map((p: any) => (
                      <div key={p.provider ?? p.id} className="flex items-center gap-2">
                        <span className="font-medium text-xs">{p.provider}:</span>
                        <Badge
                          variant={
                            p.status === "enabled"
                              ? "default"
                              : p.status === "paused"
                                ? "secondary"
                                : "destructive"
                          }
                          className="text-[10px]"
                        >
                          {p.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
