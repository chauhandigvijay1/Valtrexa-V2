import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { ExternalLink, Loader2, Pencil, Trash2, Wand2 } from "lucide-react";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";

type IvStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";
const STATUSES: IvStatus[] = ["scheduled", "completed", "cancelled", "rescheduled"];

type Interview = {
  id: string;
  company_name: string;
  role_title: string | null;
  round: string | null;
  interviewer: string | null;
  scheduled_at: string | null;
  status: IvStatus;
  meeting_url: string | null;
  notes: string | null;
  application_id: string | null;
};

const color: Record<IvStatus, string> = {
  scheduled: "bg-status-applied/15 text-status-applied",
  completed: "bg-status-offer/15 text-status-offer",
  cancelled: "bg-destructive/15 text-destructive",
  rescheduled: "bg-status-screening/15 text-status-screening",
};

export const Route = createFileRoute("/_authenticated/interviews")({
  component: InterviewsPage,
  head: () => ({ meta: [{ title: "Interviews — VALTREXA-V2" }] }),
});

function InterviewsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<IvStatus | "all">("all");
  const [editing, setEditing] = useState<Partial<Interview> | null>(null);
  const [prepLoadingId, setPrepLoadingId] = useState<string | null>(null);
  const debounced = useDebounced(search, 300);

  const q = useCrudList<Interview>({
    table: "interviews",
    searchColumn: "company_name",
    search: debounced,
    page,
    orderBy: "scheduled_at",
    ascending: false,
    extraFilter: (qb) => (statusFilter !== "all" ? qb.eq("status", statusFilter) : qb),
  });
  const save = useCrudSave<Partial<Interview>>("interviews", "interviews");
  const del = useCrudDelete("interviews", "interviews");
  const rows = q.data?.rows ?? [];

  const generatePrepMutation = useMutation({
    mutationFn: async (r: Interview) => {
      setPrepLoadingId(r.id);
      return apiPost("/api/interviews/prep", {
        interviewId: r.id,
        companyName: r.company_name,
        roleTitle: r.role_title ?? "",
      });
    },
    onSuccess: (_, r) => {
      qc.invalidateQueries({ queryKey: ["interview_preparation"] });
      toast.success(`Interview prep generated for ${r.company_name}. View in Interview Prep page.`);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPrepLoadingId(null),
  });

  return (
    <div>
      <PageHeader title="Interviews" description="Schedule, prepare and reflect." />
      <CrudShell
        search={search}
        onSearch={(v) => {
          setPage(1);
          setSearch(v);
        }}
        onNew={() => setEditing({ status: "scheduled" })}
        newLabel="New interview"
        filters={
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setPage(1);
              setStatusFilter(v as any);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Round</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.company_name}</TableCell>
                <TableCell>{r.role_title ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.round ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`capitalize ${color[r.status]}`}>
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.meeting_url && (
                    <a
                      href={r.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Generate AI interview prep"
                      disabled={prepLoadingId === r.id}
                      onClick={() => generatePrepMutation.mutate(r)}
                    >
                      {prepLoadingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4 text-accent-purple" />
                      )}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => confirm("Delete interview?") && del.mutate(r.id)}
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

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit interview" : "New interview"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Company *</Label>
                  <Input
                    value={editing.company_name ?? ""}
                    onChange={(e) => setEditing({ ...editing, company_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Input
                    value={editing.role_title ?? ""}
                    onChange={(e) => setEditing({ ...editing, role_title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Round</Label>
                  <Input
                    value={editing.round ?? ""}
                    onChange={(e) => setEditing({ ...editing, round: e.target.value })}
                    placeholder="Tech screen, onsite…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Interviewer</Label>
                  <Input
                    value={editing.interviewer ?? ""}
                    onChange={(e) => setEditing({ ...editing, interviewer: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Scheduled at</Label>
                  <Input
                    type="datetime-local"
                    value={editing.scheduled_at ? toLocal(editing.scheduled_at) : ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        scheduled_at: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={editing.status ?? "scheduled"}
                    onValueChange={(v) => setEditing({ ...editing, status: v as IvStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Meeting URL</Label>
                <Input
                  value={editing.meeting_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, meeting_url: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes / Outcome</Label>
                <Textarea
                  rows={4}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending || !editing.company_name}
                onClick={() => save.mutate(editing, { onSuccess: () => setEditing(null) })}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
