import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { CrudShell, PAGE_SIZE, useDebounced } from "@/components/crud-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Github, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function isMissingColumnError(message?: string) {
  return /column .* does not exist|Could not find the '.*' column/i.test(message ?? "");
}

type Project = {
  id: string;
  name: string;
  description: string | null;
  github_url: string | null;
  live_url: string | null;
  tech_stack: string[] | null;
  features: string[] | null;
  impact: string | null;
};

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
  head: () => ({ meta: [{ title: "Projects — VALTREXA-V2" }] }),
});

function ProjectsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  const debounced = useDebounced(search, 300);

  const q = useQuery({
    queryKey: ["projects", debounced, page],
    enabled: !!user,
    queryFn: async () => {
      let qry = supabase
        .from("projects")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });
      if (debounced) qry = qry.ilike("name", `%${debounced}%`);
      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await qry.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Project[], count: count ?? 0 };
    },
  });

  const save = useMutation({
    mutationFn: async (p: Partial<Project>) => {
      if (!user) throw new Error("Not signed in");
      const payload = {
        name: p.name ?? "",
        description: p.description ?? null,
        github_url: p.github_url ?? null,
        live_url: p.live_url ?? null,
        tech_stack: p.tech_stack ?? [],
        features: p.features ?? [],
        impact: p.impact ?? null,
      };
      if (p.id) {
        const update = await supabase.from("projects").update(payload).eq("id", p.id);
        if (update.error) {
          if (!isMissingColumnError(update.error.message)) throw update.error;
          const { features: _features, ...fallbackPayload } = payload;
          const fallback = await supabase.from("projects").update(fallbackPayload).eq("id", p.id);
          if (fallback.error) throw fallback.error;
        }
      } else {
        const insert = await supabase.from("projects").insert({ ...payload, user_id: user.id });
        if (insert.error) {
          if (!isMissingColumnError(insert.error.message)) throw insert.error;
          const { features: _features, ...fallbackPayload } = payload;
          const fallback = await supabase
            .from("projects")
            .insert({ ...fallbackPayload, user_id: user.id });
          if (fallback.error) throw fallback.error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Saved");
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["projects"] });
      const prev = qc.getQueryData<{ rows: Project[]; count: number }>([
        "projects",
        debounced,
        page,
      ]);
      if (prev)
        qc.setQueryData(["projects", debounced, page], {
          ...prev,
          rows: prev.rows.filter((r) => r.id !== id),
          count: prev.count - 1,
        });
      return { prev };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["projects", debounced, page], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const rows = q.data?.rows ?? [];

  return (
    <div>
      <PageHeader title="Projects" description="Highlight what you've built." />
      <CrudShell
        search={search}
        onSearch={(v) => {
          setPage(1);
          setSearch(v);
        }}
        onNew={() => setEditing({ tech_stack: [] })}
        newLabel="New project"
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
              <TableHead>Name</TableHead>
              <TableHead>Tech</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Links</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <div>{r.name}</div>
                  {r.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {r.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[240px]">
                    {(r.tech_stack ?? []).slice(0, 4).map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[240px]">
                    {(r.features ?? []).slice(0, 3).map((feature) => (
                      <Badge key={feature} variant="outline">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {r.github_url && (
                      <a
                        href={r.github_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Github className="h-4 w-4" />
                      </a>
                    )}
                    {r.live_url && (
                      <a
                        href={r.live_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                  {r.impact}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete project?")) del.mutate(r.id);
                      }}
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
        <ProjectDialog
          key={editing.id ?? "new"}
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => save.mutate(p)}
          busy={save.isPending}
        />
      )}
    </div>
  );
}

function ProjectDialog({
  editing,
  onClose,
  onSave,
  busy,
}: {
  editing: Partial<Project>;
  onClose: () => void;
  onSave: (p: Partial<Project>) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<Partial<Project>>(editing);
  const techStr = useMemo(() => (draft.tech_stack ?? []).join(", "), [draft.tech_stack]);
  const set = (k: keyof Project, v: any) => setDraft({ ...draft, [k]: v });

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing.id ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={draft.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>GitHub URL</Label>
              <Input
                value={draft.github_url ?? ""}
                onChange={(e) => set("github_url", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Live URL</Label>
              <Input
                value={draft.live_url ?? ""}
                onChange={(e) => set("live_url", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tech stack (comma separated)</Label>
            <Input
              value={techStr}
              onChange={(e) =>
                set(
                  "tech_stack",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Features (comma separated)</Label>
            <Input
              value={(draft.features ?? []).join(", ")}
              onChange={(e) =>
                set(
                  "features",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Impact</Label>
            <Textarea
              rows={2}
              value={draft.impact ?? ""}
              onChange={(e) => set("impact", e.target.value)}
              placeholder="Key metrics, outcomes…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !draft.name}
            onClick={() => onSave({ ...draft, id: editing.id })}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
