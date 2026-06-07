import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as React from "react";
import { Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";

type Prep = {
  id: string;
  topic: string;
  notes: string | null;
  resources: string[] | null;
  interview_id: string | null;
  completed: boolean | null;
};

export const Route = createFileRoute("/_authenticated/interview-prep")({ component: PrepPage });

function PrepPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<(Partial<Prep> & { _res?: string }) | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounced = useDebounced(search, 300);
  const q = useCrudList<Prep>({
    table: "interview_preparation",
    searchColumn: "topic",
    search: debounced,
    page,
  });
  const save = useCrudSave<Partial<Prep>>("interview_preparation", "interview_preparation");
  const del = useCrudDelete("interview_preparation", "interview_preparation");
  const rows = q.data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Interview Preparation"
        description="Topics, notes, and resources for upcoming rounds."
      />
      <CrudShell
        search={search}
        onSearch={(v) => {
          setPage(1);
          setSearch(v);
        }}
        onNew={() => setEditing({ completed: false })}
        newLabel="New topic"
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
              <TableHead className="w-10"></TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Resources</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <TableCell>
                    {expandedId === r.id ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{r.topic}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {(r.resources ?? []).length} link(s)
                    </span>
                  </TableCell>
                  <TableCell>
                    {r.completed ? <Badge>Done</Badge> : <Badge variant="secondary">Pending</Badge>}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing({ ...r, _res: (r.resources ?? []).join("\n") })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => confirm("Delete topic?") && del.mutate(r.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === r.id && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/30 p-4 border-t">
                      <div className="space-y-4">
                        {r.notes ? (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                              Notes / Briefing
                            </h4>
                            <div className="text-sm whitespace-pre-wrap text-foreground bg-background p-3 rounded-md border leading-relaxed">
                              {r.notes}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">No notes available.</div>
                        )}

                        {r.resources && r.resources.length > 0 ? (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Suggested Resources
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {r.resources.map((url, idx) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-xs font-medium text-primary hover:underline bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20"
                                >
                                  {url}
                                </a>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                              Suggested Resources
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              No resources linked.
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </CrudShell>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit topic" : "New topic"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Topic *</Label>
                <Input
                  value={editing.topic ?? ""}
                  onChange={(e) => setEditing({ ...editing, topic: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Interview ID (optional)</Label>
                <Input
                  value={editing.interview_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, interview_id: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  rows={4}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Resources (one URL per line)</Label>
                <Textarea
                  rows={3}
                  value={editing._res ?? ""}
                  onChange={(e) => setEditing({ ...editing, _res: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2">
                <Switch
                  checked={!!editing.completed}
                  onCheckedChange={(v) => setEditing({ ...editing, completed: v })}
                />
                <span className="text-sm">Completed</span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending || !editing.topic}
                onClick={() => {
                  const { _res, ...rest } = editing;
                  save.mutate(
                    {
                      ...rest,
                      resources: (_res ?? "")
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean),
                    } as Partial<Prep>,
                    { onSuccess: () => setEditing(null) },
                  );
                }}
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
