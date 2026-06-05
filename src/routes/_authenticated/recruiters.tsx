import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { CrudShell, useDebounced } from "@/components/crud-shell";
import { useCrudDelete, useCrudList, useCrudSave } from "@/hooks/use-crud";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Linkedin, Loader2, Mail, Pencil, Phone, Search, Trash2, Wand2, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";

type Recruiter = {
  id: string; name: string; email: string | null; phone: string | null;
  company: string | null; linkedin_url: string | null; notes: string | null;
  last_contacted_at: string | null;
  title: string | null; source: string | null;
  discovered_via: string | null; relevance_score: number | null;
  role: string | null; profile_url: string | null;
};

export const Route = createFileRoute("/_authenticated/recruiters")({ component: RecruitersPage });

function RecruitersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partial<Recruiter> | null>(null);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [discoveryCompany, setDiscoveryCompany] = useState("");
  const [discoveryRole, setDiscoveryRole] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounced = useDebounced(search, 300);
  const q = useCrudList<Recruiter>({ table: "recruiters", searchColumn: "name", search: debounced, page });
  const save = useCrudSave<Partial<Recruiter>>("recruiters", "recruiters");
  const del = useCrudDelete("recruiters", "recruiters");
  const rows = q.data?.rows ?? [];

  const discoverMutation = useMutation({
    mutationFn: async () => {
      return apiPost<{ recruiters: any[]; companyName: string }>(
        "/api/recruiters/discover",
        { companyName: discoveryCompany, roleTitle: discoveryRole || undefined }
      );
    },
    onSuccess: async (data) => {
      toast.success(`Discovered ${data.recruiters.length} recruiter(s) at ${data.companyName}!`);
      await qc.invalidateQueries({ queryKey: ["recruiters"] });
      setDiscoveryOpen(false);
      setDiscoveryCompany("");
      setDiscoveryRole("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Recruiters" description="Your recruiter and company CRM." />
      <CrudShell
        search={search} onSearch={(v) => { setPage(1); setSearch(v); }}
        onNew={() => setEditing({})} newLabel="New recruiter"
        loading={q.isLoading} error={q.error} empty={rows.length === 0}
        count={q.data?.count ?? 0} page={page} setPage={setPage}
        filters={
          <Button variant="outline" size="sm" onClick={() => setDiscoveryOpen(true)} className="gap-1.5">
            <Wand2 className="h-4 w-4 text-purple-500" /> Discover Recruiters
          </Button>
        }
      >
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Name</TableHead><TableHead>Company</TableHead>
            <TableHead>Contact</TableHead><TableHead>Last contacted</TableHead>
            <TableHead className="w-24" />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <TableCell>
                    {expandedId === r.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>{r.name}</div>
                    {r.title && <div className="text-xs text-muted-foreground font-normal mt-0.5">{r.title}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.company ?? "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2 text-muted-foreground">
                      {r.email && <a href={`mailto:${r.email}`} title={r.email}><Mail className="h-4 w-4" /></a>}
                      {r.phone && <a href={`tel:${r.phone}`} title={r.phone}><Phone className="h-4 w-4" /></a>}
                      {r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4" /></a>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.last_contacted_at ? new Date(r.last_contacted_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => confirm("Delete recruiter?") && del.mutate(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === r.id && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/30 p-4 border-t">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">CRM Notes & Details</h4>
                          <div className="text-sm whitespace-pre-wrap text-foreground bg-background p-3 rounded-md border leading-relaxed">
                            {r.notes || "No notes available."}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Metadata</h4>
                            <div className="grid grid-cols-2 gap-2 text-xs bg-background p-3 rounded-md border">
                              <div>
                                <span className="text-muted-foreground block">Source</span>
                                <span className="font-medium capitalize">{r.source || "Manual"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Discovered Via</span>
                                <span className="font-medium">{r.discovered_via || "—"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Relevance Score</span>
                                <span className="font-medium">{r.relevance_score !== null ? `${Math.round(Number(r.relevance_score) * 100)}%` : "—"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Title / Role</span>
                                <span className="font-medium">{r.title || "—"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Classification</span>
                                <span className="font-medium">{r.role || "—"}</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground block">Profile URL</span>
                                <span className="font-medium break-all">
                                  {r.profile_url ? (
                                    <a href={r.profile_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                                      {r.profile_url} <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </CrudShell>

      {/* Recruiter Discovery Dialog */}
      {discoveryOpen && (
        <Dialog open onOpenChange={(o) => !o && setDiscoveryOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-purple-500" /> AI Recruiter Discovery</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input value={discoveryCompany} onChange={(e) => setDiscoveryCompany(e.target.value)} placeholder="e.g., Supabase, Vercel…" />
              </div>
              <div className="space-y-1.5">
                <Label>Target Role (optional)</Label>
                <Input value={discoveryRole} onChange={(e) => setDiscoveryRole(e.target.value)} placeholder="e.g., Senior Frontend Engineer" />
              </div>
              <p className="text-xs text-muted-foreground">
                AI will identify likely recruiters, hiring managers, and engineering leads at the specified company.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDiscoveryOpen(false)}>Cancel</Button>
              <Button disabled={discoverMutation.isPending || !discoveryCompany.trim()} onClick={() => discoverMutation.mutate()}>
                {discoverMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Discovering…</> : <><Search className="h-4 w-4 mr-2" /> Discover</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{editing.id ? "Edit recruiter" : "New recruiter"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Name *" v={editing.name} on={(v) => setEditing({ ...editing, name: v })} />
                <Field label="Company" v={editing.company} on={(v) => setEditing({ ...editing, company: v })} />
                <Field label="Email" v={editing.email} on={(v) => setEditing({ ...editing, email: v })} />
                <Field label="Phone" v={editing.phone} on={(v) => setEditing({ ...editing, phone: v })} />
                <Field label="LinkedIn" v={editing.linkedin_url} on={(v) => setEditing({ ...editing, linkedin_url: v })} />
                <Field label="Profile URL" v={editing.profile_url} on={(v) => setEditing({ ...editing, profile_url: v })} />
                <div className="space-y-1.5">
                  <Label>Classification</Label>
                  <Select value={editing.role ?? ""} onValueChange={(val) => setEditing({ ...editing, role: val || null })}>
                    <SelectTrigger><SelectValue placeholder="Select classification" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Recruiter">Recruiter</SelectItem>
                      <SelectItem value="Hiring Manager">Hiring Manager</SelectItem>
                      <SelectItem value="Engineering Manager">Engineering Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Last contacted</Label>
                  <Input type="date" value={editing.last_contacted_at?.slice(0, 10) ?? ""}
                    onChange={(e) => setEditing({ ...editing, last_contacted_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
              </div>
              <div className="space-y-1.5"><Label>Notes</Label>
                <Textarea rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={save.isPending || !editing.name}
                onClick={() => save.mutate(editing, { onSuccess: () => setEditing(null) })}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Field({ label, v, on }: { label: string; v?: string | null; on: (s: string) => void }) {
  return (
    <div className="space-y-1.5"><Label>{label}</Label>
      <Input value={v ?? ""} onChange={(e) => on(e.target.value)} />
    </div>
  );
}