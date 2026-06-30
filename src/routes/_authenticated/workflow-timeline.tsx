import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  Play,
  Pause,
  StopCircle,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/workflow-timeline")({
  head: () => ({ meta: [{ title: "Workflow — VALTREXA-V2" }] }),
  component: WorkflowTimelinePage,
});

type Stage = {
  id: string;
  stage: string;
  status: "running" | "completed" | "failed" | "skipped";
  label: string | null;
  message: string | null;
  progress: number;
  total: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  metadata: any;
};

function WorkflowTimelinePage() {
  const { user, session } = useAuth();
  const authToken = session?.access_token;
  const qc = useQueryClient();

  const { data: stages = [], isLoading } = useQuery({
    queryKey: ["workflow-timeline", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("workflow_timeline")
        .select("*")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Stage[];
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: wfState } = useQuery({
    queryKey: ["workflow-state", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("workflow_state")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const startWf = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/workflow/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed to start");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-state"] });
      toast.success("Workflow started");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pauseWf = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/workflow/pause", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed to pause");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-state"] });
      toast.success("Workflow paused");
    },
  });

  const stopWf = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/workflow/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed to stop");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-state"] });
      toast.success("Workflow stopped");
    },
  });

  const statusIcon = (s: string) => {
    switch (s) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Activity className="h-4 w-4 text-blue-500" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const stageLabel = (s: Stage) =>
    s.label ?? s.stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const running = stages.filter((s) => s.status === "running").length;
  const completed = stages.filter((s) => s.status === "completed").length;
  const failed = stages.filter((s) => s.status === "failed").length;

  return (
    <div>
      <PageHeader
        title="Workflow Timeline"
        description="Live workflow stages, progress, and state management"
        actions={
          <div className="flex gap-2">
            {(!wfState || wfState.status === "stopped" || wfState.status === "paused") && (
              <Button size="sm" onClick={() => startWf.mutate()} disabled={startWf.isPending}>
                <Play className="h-4 w-4 mr-1" /> Start
              </Button>
            )}
            {wfState?.status === "running" && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => pauseWf.mutate()}
                  disabled={pauseWf.isPending}
                >
                  <Pause className="h-4 w-4 mr-1" /> Pause
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => stopWf.mutate()}
                  disabled={stopWf.isPending}
                >
                  <StopCircle className="h-4 w-4 mr-1" /> Stop
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => qc.invalidateQueries({ queryKey: ["workflow-timeline"] })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {wfState && (
        <Card className="p-4 mb-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">State:</span>
            <Badge
              variant={
                wfState.status === "running"
                  ? "default"
                  : wfState.status === "paused"
                    ? "secondary"
                    : "outline"
              }
            >
              {wfState.status}
            </Badge>
            {wfState.cycle_id && (
              <span className="font-mono text-[10px] text-muted-foreground">
                Cycle: {wfState.cycle_id.substring(0, 12)}...
              </span>
            )}
            {wfState.error && <span className="text-destructive text-xs">{wfState.error}</span>}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-3 text-center">
          <div className="text-2xl font-semibold text-blue-500">{running}</div>
          <div className="text-xs text-muted-foreground">Running</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-semibold text-green-500">{completed}</div>
          <div className="text-xs text-muted-foreground">Completed</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-semibold text-red-500">{failed}</div>
          <div className="text-xs text-muted-foreground">Failed</div>
        </Card>
      </div>

      <div className="space-y-2">
        {stages.length === 0 && !isLoading && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No workflow stages yet. Start the workflow to begin tracking.
          </Card>
        )}
        {stages.map((s) => {
          const duration = s.completed_at
            ? Math.round(
                (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000,
              )
            : null;
          return (
            <Card key={s.id} className="p-3">
              <div className="flex items-center gap-3">
                {statusIcon(s.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{stageLabel(s)}</span>
                    <Badge
                      variant={
                        s.status === "completed"
                          ? "default"
                          : s.status === "failed"
                            ? "destructive"
                            : s.status === "running"
                              ? "secondary"
                              : "outline"
                      }
                      className="text-[10px]"
                    >
                      {s.status}
                    </Badge>
                  </div>
                  {s.message && <p className="text-xs text-muted-foreground mt-0.5">{s.message}</p>}
                  {s.total > 0 && (
                    <Progress
                      value={s.total > 0 ? (s.progress / s.total) * 100 : 0}
                      className="mt-1 h-1"
                    />
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(s.started_at).toLocaleTimeString()}
                  </div>
                  {duration !== null && (
                    <div className="text-[10px] text-muted-foreground">{duration}s</div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
