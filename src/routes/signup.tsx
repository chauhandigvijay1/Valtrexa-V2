import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create Account — VALTREXA-V2" }] }),
  component: SignupPage,
});

function SignupPage() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      nav({ to: "/dashboard", replace: true });
    }
  }, [loading, user, nav]);

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    // Create profile record immediately
    if (data.session?.user) {
      const token = data.session.access_token;
      await fetch("/api/auth/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      }).catch(() => {});
      emitEvent("user_signed_up");
      nav({ to: "/dashboard", replace: true });
    } else {
      // Email confirmation required — redirect to confirm page
      nav({ to: "/auth/confirm-email", replace: true });
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Create your VALTREXA-V2 account</h1>
          <p className="text-sm text-muted-foreground">
            Set up your workspace for resumes, jobs, and outreach.
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
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
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
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy || oauthBusy} className="w-full">
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <div className="text-sm">
          <Link to="/login" className="text-primary hover:underline">
            Already have an account? Sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}
