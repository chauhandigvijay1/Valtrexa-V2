import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCheck,
  Bell,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — VALTREXA-V2" }] }),
  component: NotificationsPage,
});

type Notification = {
  id: string;
  category: string;
  title: string;
  message: string | null;
  severity: "info" | "warning" | "error" | "success";
  read: boolean;
  link: string | null;
  created_at: string;
};

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as Notification[];
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any)
        .from("notifications")
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await (supabase as any)
        .from("notifications")
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("user_id", user?.id)
        .eq("read", false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
      toast.success("All marked read");
    },
  });

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "error") return n.severity === "error";
    if (filter === "warning") return n.severity === "warning";
    return true;
  });

  const severityIcon = (s: string) => {
    switch (s) {
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${unread} unread · ${notifications.length} total`}
        actions={
          unread > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
            </Button>
          )
        }
      />

      <Tabs defaultValue="all" value={filter} onValueChange={setFilter}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
          <TabsTrigger value="unread">Unread ({unread})</TabsTrigger>
          <TabsTrigger value="error">Errors</TabsTrigger>
          <TabsTrigger value="warning">Warnings</TabsTrigger>
        </TabsList>

        <TabsContent value={filter}>
          <div className="space-y-2">
            {filtered.length === 0 && (
              <Card className="p-8 text-center">
                <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No notifications</p>
              </Card>
            )}
            {filtered.map((n) => (
              <Card
                key={n.id}
                className={cn(
                  "p-4 transition-colors",
                  !n.read && "border-l-2 border-l-primary bg-muted/20",
                )}
                onClick={() => !n.read && markRead.mutate(n.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{severityIcon(n.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-medium", !n.read && "text-foreground")}>
                        {n.title}
                      </span>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    {n.message && <p className="text-xs text-muted-foreground mt-1">{n.message}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-[10px]">
                        {n.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                      {n.link && (
                        <a
                          href={n.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
