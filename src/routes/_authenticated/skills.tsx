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
import { Pencil, Trash2 } from "lucide-react";

type Skill = {
  id: string;
  name: string;
  category: string | null;
  level: "beginner" | "intermediate" | "advanced" | "expert";
};
const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;

export const Route = createFileRoute("/_authenticated/skills")({ component: SkillsPage });

function SkillsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partial<Skill> | null>(null);
  const debounced = useDebounced(search, 300);
  const q = useCrudList<Skill>({ table: "skills", searchColumn: "name", search: debounced, page });
  const save = useCrudSave<Partial<Skill>>("skills", "skills");
  const del = useCrudDelete("skills", "skills");
  const rows = q.data?.rows ?? [];

  return (
    <div>
      <PageHeader title="Skills" description="Catalog skills by category and proficiency." />
      <CrudShell
        search={search}
        onSearch={(v) => {
          setPage(1);
          setSearch(v);
        }}
        onNew={() => setEditing({ level: "intermediate" })}
        newLabel="New skill"
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
              <TableHead>Category</TableHead>
              <TableHead>Level</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.category ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {r.level}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => confirm("Delete skill?") && del.mutate(r.id)}
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit skill" : "New skill"}</DialogTitle>
            </DialogHeader>
            <SkillForm draft={editing} onChange={setEditing} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending || !editing.name}
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

function SkillForm({
  draft,
  onChange,
}: {
  draft: Partial<Skill>;
  onChange: (s: Partial<Skill>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input
          value={draft.name ?? ""}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Input
          value={draft.category ?? ""}
          onChange={(e) => onChange({ ...draft, category: e.target.value })}
          placeholder="Frontend, DevOps…"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Level</Label>
        <Select
          value={draft.level ?? "intermediate"}
          onValueChange={(v) => onChange({ ...draft, level: v as Skill["level"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((l) => (
              <SelectItem key={l} value={l} className="capitalize">
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
