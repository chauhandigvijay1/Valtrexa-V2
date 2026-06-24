import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { hasAuthCallbackParams } from "@/lib/auth-callback";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const waitingForCallback = hasAuthCallbackParams();

  useEffect(() => {
    if (!loading && !user && !waitingForCallback) {
      nav({ to: "/login", replace: true });
    }
  }, [loading, user, nav, waitingForCallback]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border px-3 gap-2">
            <SidebarTrigger />
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          <main id="main-content" className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
