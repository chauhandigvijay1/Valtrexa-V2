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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, ShieldCheck, MessageCircle } from "lucide-react";

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
    description:
      "Saved search URL for HTML-based import. Manage your cookie on the Cookie Health page.",
    workflow: "Opportunity Radar import flow",
    backendUsage: "Passed as headers/search defaults to /api/jobs/import for LinkedIn scraping",
    fields: [{ name: "search_url", label: "Search URL" }],
  },
  {
    key: "wellfound",
    label: "Wellfound",
    description:
      "Saved search URL for HTML-based import. Manage your cookie on the Cookie Health page.",
    workflow: "Opportunity Radar import flow",
    backendUsage: "Passed as headers/search defaults to /api/jobs/import for Wellfound scraping",
    fields: [{ name: "search_url", label: "Search URL" }],
  },
  {
    key: "naukri",
    label: "Naukri",
    description:
      "Saved search URL for HTML-based import. Manage your cookie on the Cookie Health page.",
    workflow: "Opportunity Radar import flow",
    backendUsage: "Passed as headers/search defaults to /api/jobs/import for Naukri scraping",
    fields: [{ name: "search_url", label: "Search URL" }],
  },
];

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Only live integrations stay here. Each card saves to the database and is consumed by a real workflow."
      />
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Your User ID: <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{user?.id}</code>
        </p>
      </Card>
      <TelegramBindingCard />
      <Alert>
        <AlertTitle>Configured via environment variables</AlertTitle>
        <AlertDescription>
          Telegram (bot), Gmail (OAuth), Groq (AI fallback), Indeed (scraping), and Instahyre
          (scraping) are fully wired into the production workflow but configured through server-side
          environment variables rather than this UI. LinkedIn, Naukri, and Wellfound cookies can
          also be set globally via WELLFOUND_COOKIE in .env.
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
      const cleanConfig: Record<string, string> = {};
      for (const [key, value] of Object.entries(config)) {
        if (key.toLowerCase().includes("cookie") && value?.trim()) {
          const resp = await fetch("/api/cookies/set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: provider.key, cookie: value }),
          });
          if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed to store cookie");
        } else {
          cleanConfig[key] = value;
        }
      }
      const payload = { user_id: user.id, provider: provider.key, config: cleanConfig, enabled };
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

  const [validateResults, setValidateResults] = useState<
    Record<string, { valid: boolean; reason?: string }>
  >({});
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const validateCookie = useMutation({
    mutationFn: async (cookieValue: string) => {
      const resp = await fetch("/api/cookies/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.key, cookie: cookieValue }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Validation failed");
      return resp.json() as Promise<{ valid: boolean; reason?: string }>;
    },
    onSuccess: (data) => {
      setValidateResults({ [provider.key]: data });
      if (data.valid) {
        toast.success(`${provider.label} cookie format is valid`);
      } else {
        toast.error(`${provider.label} cookie: ${data.reason}`);
      }
    },
    onError: (e: any) => {
      setValidateResults({ [provider.key]: { valid: false, reason: e.message } });
      toast.error(e.message);
    },
  });

  const removeCookie = useMutation({
    mutationFn: async () => {
      const resp = await fetch(`/api/cookies/${provider.key}`, { method: "DELETE" });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Remove failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success(`${provider.label} cookie removed`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const isCookieProvider = ["linkedin", "wellfound", "naukri"].includes(provider.key);

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
            {provider.fields.map((field) => {
              const isCookieField = field.name.toLowerCase().includes("cookie");
              return (
                <div key={field.name} className="space-y-1">
                  <Label className="text-xs">{field.label}</Label>
                  <div className="flex gap-2">
                    <Input
                      type={field.type === "password" ? "password" : "text"}
                      value={config[field.name] ?? ""}
                      onChange={(event) => {
                        setConfig({ ...config, [field.name]: event.target.value });
                        if (isCookieField) {
                          setValidateResults({});
}

function TelegramBindingCard() {
  const [token, setToken] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generateToken = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions
        ?.invoke?.("telegram/binding", { method: "POST" });
      // Fallback: direct fetch
      const res = await fetch("/api/telegram/binding", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to generate token");
      const result = await res.json();
      setToken(result.token);
      setDeepLink(result.deepLink);
      setExpiresAt(result.expiresAt);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      toast.success("Token copied to clipboard");
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold">Telegram Connection</h3>
        </div>
        <Badge variant={token ? "default" : "secondary"}>
          {token ? "Token Generated" : "Not Connected"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Generate a one-time token, then send it to the Telegram bot via <code>/connect &lt;token&gt;</code>
      </p>
      {token ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input readOnly value={token} className="font-mono text-xs" />
            <Button size="sm" onClick={copyToken}>Copy</Button>
          </div>
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline inline-block"
            >
              Open Telegram Deep Link
            </a>
          )}
          {expiresAt && (
            <p className="text-xs text-muted-foreground">
              Expires at {new Date(expiresAt).toLocaleTimeString()}
            </p>
          )}
          <Button size="sm" variant="outline" onClick={() => { setToken(null); setDeepLink(null); setExpiresAt(null); }}>
            Generate New Token
          </Button>
        </div>
      ) : (
        <Button onClick={generateToken} disabled={loading}>
          {loading ? "Generating..." : "Generate Connection Token"}
        </Button>
      )}
    </Card>
  );
}
                      }}
                      placeholder={field.type === "password" ? "••••••••" : ""}
                      className="flex-1"
                    />
                    {isCookieField && config[field.name]?.trim() && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-xs"
                        onClick={() => validateCookie.mutate(config[field.name])}
                        disabled={validateCookie.isPending}
                      >
                        <ShieldCheck className="h-3 w-3 mr-1" /> Validate
                      </Button>
                    )}
                  </div>
                  {validateResults[provider.key] && isCookieField && (
                    <p
                      className={`text-xs ${
                        validateResults[provider.key].valid ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {validateResults[provider.key].valid
                        ? "Valid format"
                        : validateResults[provider.key].reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {isCookieProvider && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Need help extracting your cookie? Visit{" "}
                <a href="/cookies" className="underline text-primary">
                  Cookie Health
                </a>{" "}
                for step-by-step guides.
              </p>
              <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={removeCookie.isPending}>
                    <Trash2 className="h-3 w-3 mr-1" /> Remove Cookie
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Remove {provider.label} cookie?</DialogTitle>
                    <DialogDescription>
                      This will delete the stored cookie for {provider.label}. You will need to
                      paste it again to resume job imports from this provider.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowRemoveConfirm(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setShowRemoveConfirm(false);
                        removeCookie.mutate();
                      }}
                    >
                      Remove
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

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
