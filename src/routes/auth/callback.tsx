import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Completing sign in — VALTREXA-V2" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const nav = useNavigate();

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = sessionStorage.getItem("oauth_state");
    sessionStorage.removeItem("oauth_state");

    if (state && savedState && state !== savedState) {
      toast.error("Sign-in failed: state mismatch. Please try again.");
      nav({ to: "/login", replace: true });
      return;
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          toast.error(error.message);
          nav({ to: "/login", replace: true });
          return;
        }
        // Create profile if new user
        supabase.auth.getSession().then(async ({ data: sData }) => {
          if (sData.session?.user) {
            const token = sData.session.access_token;
            const oauthName =
              sData.session.user.user_metadata?.full_name ||
              sData.session.user.user_metadata?.name ||
              "";
            await fetch("/api/auth/create-profile", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ name: oauthName }),
            }).catch(() => {});
            await fetch("/api/auth/log-event", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ event: "user_logged_in" }),
            }).catch(() => {});
          }
          nav({ to: "/dashboard", replace: true });
        });
      });
    } else {
      // No code but no error — session might already be set, try polling briefly
      let attempts = 0;
      const poll = setInterval(async () => {
        const { data: sData } = await supabase.auth.getSession();
        if (sData.session?.user) {
          clearInterval(poll);
          nav({ to: "/dashboard", replace: true });
        }
        if (++attempts > 10) {
          clearInterval(poll);
          nav({ to: "/login", replace: true });
        }
      }, 300);
    }
  }, [nav]);

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="text-center space-y-3">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-muted-foreground">
          Completing sign-in and restoring your session...
        </p>
      </div>
    </div>
  );
}
