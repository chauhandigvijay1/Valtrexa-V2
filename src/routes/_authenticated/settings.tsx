import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

type Provider = {
  key: string;
  label: string;
  description: string;
  workflow: string;
  backendUsage: string;
  fields: { name: string; label: string; type?: "text" | "password" }[];
};

const OPENROUTER_MODEL_CHAIN = [
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nvidia/nemotron-nano-9b-v2:free",
] as const;

const PROVIDERS: Provider[] = [
  {
    key: "openrouter",
    label: "OpenRouter",
    description:
      "Primary AI provider for ATS, company research, pain points, outreach, and Loom generation.",
    workflow: "Resume intelligence and downstream generation modules",
    backendUsage:
      "Consumed by server handlers in /api/resumes, /api/company-research, /api/painpoints, /api/outreach, and /api/loom",
    fields: [{ name: "api_key", label: "API key", type: "password" }],
  },
  {
    key: "greenhouse",
    label: "Greenhouse",
    description: "Default board token for job ingestion.",
    workflow: "Opportunity Radar import flow",
    backendUsage:
      "Merged into /api/jobs/import when a source-specific token is not supplied manually",
    fields: [{ name: "board_token", label: "Board token" }],
  },
  {
    key: "lever",
    label: "Lever",
    description: "Default Lever site slug for job ingestion.",
    workflow: "Opportunity Radar import flow",
    backendUsage:
      "Merged into /api/jobs/import when a source-specific site is not supplied manually",
    fields: [{ name: "site", label: "Site slug" }],
  },
  {
    key: "ashby",
    label: "Ashby",
    description: "Default Ashby board URL for job ingestion.",
    workflow: "Opportunity Radar import flow",
    backendUsage:
      "Merged into /api/jobs/import when a source-specific URL is not supplied manually",
    fields: [{ name: "board_url", label: "Board URL" }],
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    description: "Saved search URL and cookie for HTML-based import.",
    workflow: "Opportunity Radar import flow",
    backendUsage: "Passed as headers/search defaults to /api/jobs/import for LinkedIn scraping",
    fields: [
      { name: "search_url", label: "Search URL" },
      { name: "session_cookie", label: "Session cookie", type: "password" },
    ],
  },
  {
    key: "wellfound",
    label: "Wellfound",
    description: "Saved search URL and cookie for HTML-based import.",
    workflow: "Opportunity Radar import flow",
    backendUsage: "Passed as headers/search defaults to /api/jobs/import for Wellfound scraping",
    fields: [
      { name: "search_url", label: "Search URL" },
      { name: "cookie", label: "Cookie", type: "password" },
    ],
  },
  {
    key: "naukri",
    label: "Naukri",
    description: "Saved search URL and cookie for HTML-based import.",
    workflow: "Opportunity Radar import flow",
    backendUsage: "Passed as headers/search defaults to /api/jobs/import for Naukri scraping",
    fields: [
      { name: "search_url", label: "Search URL" },
      { name: "cookie", label: "Cookie", type: "password" },
    ],
  },
];

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Only live integrations stay here. Each card saves to the database and is consumed by a real workflow."
      />
      <Alert>
        <AlertTitle>Removed from the release surface</AlertTitle>
        <AlertDescription>
          Telegram, Gmail, Groq, Indeed, and Instahyre were removed from settings because they were
          not wired into the current production workflow.
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 xl:grid-cols-2">
        {PROVIDERS.map((provider) => (
          <IntegrationCard key={provider.key} provider={provider} />
        ))}
      </div>
    </div>
  );
}

function IntegrationCard({ provider }: { provider: Provider }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["integration", provider.key, user?.id];

  const q = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("provider", provider.key)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [config, setConfig] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (q.data) {
      setConfig((q.data.config as Record<string, string>) ?? {});
      setEnabled(!!q.data.enabled);
    } else {
      setConfig({});
      setEnabled(provider.key === "openrouter");
    }
  }, [provider.key, q.data]);

  const configured = useMemo(
    () => Object.values(config).some((value) => Boolean(value?.trim())),
    [config],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const payload = { user_id: user.id, provider: provider.key, config, enabled };
      if (q.data?.id) {
        const { error } = await supabase.from("integrations").update(payload).eq("id", q.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integrations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success(`${provider.label} saved`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-lg font-semibold">{provider.label}</div>
          <div className="text-sm text-muted-foreground">{provider.description}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">DB-backed</Badge>
          <Badge variant="outline">Workflow live</Badge>
          {configured && <Badge variant="secondary">Configured</Badge>}
          {enabled && <Badge>Enabled</Badge>}
        </div>
      </div>

      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
        <div>
          <div className="font-medium text-foreground">Workflow</div>
          <div>{provider.workflow}</div>
        </div>
        <div>
          <div className="font-medium text-foreground">Backend usage</div>
          <div>{provider.backendUsage}</div>
        </div>
      </div>

      {provider.key === "openrouter" && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-sm font-medium">Free-first model chain</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {OPENROUTER_MODEL_CHAIN.map((model) => (
              <Badge key={model} variant="outline">
                {model}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {provider.fields.map((field) => (
              <div key={field.name} className="space-y-1">
                <Label className="text-xs">{field.label}</Label>
                <Input
                  type={field.type === "password" ? "password" : "text"}
                  value={config[field.name] ?? ""}
                  onChange={(event) => setConfig({ ...config, [field.name]: event.target.value })}
                  placeholder={field.type === "password" ? "••••••••" : ""}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              Enabled
            </label>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
