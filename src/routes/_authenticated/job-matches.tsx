import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { CrudShell, useDebounced } from "@/components/crud-shell";
import { useCrudDelete, useCrudList, useCrudSave } from "@/hooks/use-crud";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";

type Match = {
  id: string; job_id: string | null; score: number; reasons: string | null;
  skills_matched: string[] | null; skills_missing: string[] | null;
  recommended_resume_id: string | null;
};

export const Route = createFileRoute("/_authenticated/job-matches")({ component: JobMatchesPage });

function csv(s: string) { return s.split(",").map((x) => x.trim()).filter(Boolean); }

function JobMatchesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<(Partial<Match> & { _matched?: string; _missing?: string }) | null>(null);
  const debounced = useDebounced(search, 300);
  const q = useCrudList<Match>({ table: "job_matches", searchColumn: "reasons", search: debounced, page, orderBy: "score" });
  const save = useCrudSave<Partial<Match>>("job_matches", "job_matches");
  const del = useCrudDelete("job_matches", "job_matches");
  const rows = q.data?.rows ?? [];

  return (
    <div>
      <PageHeader title="Job Matches" description="Score breakdown between you and opportunities." />
      <CrudShell search={search} onSearch={(v) => { setPage(1); setSearch(v); }}
        onNew={() => setEditing({ score: 70 })} newLabel="New match"
        loading={q.isLoading} error={q.error} empty={rows.length === 0}
        count={q.data?.count ?? 0} page={page} setPage={setPage}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Score</TableHead><TableHead>Matched</TableHead>
            <TableHead>Missing</TableHead><TableHead>Reasons</TableHead>
            <TableHead className="w-24" />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="w-40">
                  <div className="flex items-center gap-2"><Progress value={r.score} className="h-2" /><span className="text-xs tabular-nums">{r.score}</span></div>
                </TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{(r.skills_matched ?? []).slice(0, 4).map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div></TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{(r.skills_missing ?? []).slice(0, 4).map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div></TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">{r.reasons ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...r, _matched: (r.skills_matched ?? []).join(", "), _missing: (r.skills_missing ?? []).join(", ") })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm("Delete match?") && del.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CrudShell>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing.id ? "Edit match" : "New match"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Job ID (uuid)</Label><Input value={editing.job_id ?? ""} onChange={(e) => setEditing({ ...editing, job_id: e.target.value || null })} placeholder="Optional" /></div>
              <div className="space-y-1.5"><Label>Score (0–100)</Label><Input type="number" min={0} max={100} value={editing.score ?? 0} onChange={(e) => setEditing({ ...editing, score: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Skills matched (comma separated)</Label><Input value={editing._matched ?? ""} onChange={(e) => setEditing({ ...editing, _matched: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Skills missing (comma separated)</Label><Input value={editing._missing ?? ""} onChange={(e) => setEditing({ ...editing, _missing: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Reasons</Label><Textarea rows={3} value={editing.reasons ?? ""} onChange={(e) => setEditing({ ...editing, reasons: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={save.isPending} onClick={() => {
                const { _matched, _missing, ...rest } = editing;
                save.mutate({ ...rest, skills_matched: csv(_matched ?? ""), skills_missing: csv(_missing ?? "") } as Partial<Match>, { onSuccess: () => setEditing(null) });
              }}>{save.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}