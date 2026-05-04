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
  head: () => ({ meta: [{ title: "Create Account — Career Compass Pro" }] }),
  component: SignupPage,
});

function SignupPage() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      nav({ to: "/dashboard", replace: true });
    }
  }, [loading, user, nav]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
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

    toast.success("Account created. Check your inbox if email confirmation is enabled.");
    nav({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Create your Career Compass Pro account</h1>
          <p className="text-sm text-muted-foreground">Set up your workspace for resumes, jobs, and outreach.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
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
