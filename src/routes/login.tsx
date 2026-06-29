import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  clearAuthCallbackParams,
  getAuthCallbackError,
  hasAuthCallbackParams,
} from "@/lib/auth-callback";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign In - VALTREXA-V2" }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(() => hasAuthCallbackParams());

  useEffect(() => {
    if (!loading && user) {
      nav({ to: "/dashboard", replace: true });
    }
  }, [loading, user, nav]);

  useEffect(() => {
    if (!hasAuthCallbackParams()) return;

    let cancelled = false;

    const finishOAuth = async () => {
      const callbackError = getAuthCallbackError();
      if (callbackError) {
        clearAuthCallbackParams();
        setOauthBusy(false);
        toast.error(callbackError);
        return;
      }

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          clearAuthCallbackParams();
          setOauthBusy(false);
          toast.error(error.message);
          return;
        }
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (cancelled) return;

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          clearAuthCallbackParams();
          setOauthBusy(false);
          toast.error(error.message);
          return;
        }

        if (data.session?.user) {
          clearAuthCallbackParams();
          nav({ to: "/dashboard", replace: true });
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      if (!cancelled) {
        clearAuthCallbackParams();
        setOauthBusy(false);
        toast.error("Google sign-in completed, but the session did not persist. Please try again.");
      }
    };

    void finishOAuth();

    return () => {
      cancelled = true;
    };
  }, [nav]);

  const emitEvent = (event: string) => {
    supabase.auth.getSession().then(({ data: sData }) => {
      const token = sData.session?.access_token;
      if (token) {
        fetch("/api/auth/log-event", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event }),
        }).catch(() => {});
      }
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back");
    emitEvent("user_logged_in");
  };

  const google = async () => {
    setOauthBusy(true);
    const state = crypto.randomUUID();
    sessionStorage.setItem("oauth_state", state);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { state },
      },
    });
    if (error) {
      setOauthBusy(false);
      toast.error(error.message);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to VALTREXA-V2</h1>
          <p className="text-sm text-muted-foreground">
            Resume intelligence, job discovery, research, and outreach in one workspace.
          </p>
        </div>

        {oauthBusy ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-4 text-sm text-muted-foreground">
            Completing Google sign-in and restoring your session...
          </div>
        ) : (
          <Button onClick={google} variant="outline" className="w-full" disabled={busy}>
            Continue with Google
          </Button>
        )}

        <div className="relative text-center text-xs text-muted-foreground">
          <span className="bg-card px-2 relative z-10">or</span>
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy || oauthBusy} className="w-full">
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
          <Link to="/signup" className="text-primary hover:underline">
            Create account
          </Link>
        </div>
      </Card>
    </div>
  );
}
