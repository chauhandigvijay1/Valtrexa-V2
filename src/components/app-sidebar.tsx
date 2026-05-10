import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, User, FolderGit2, Wrench, FileText, Radar,
  Briefcase, Users, Send, Calendar, BarChart3, Settings as SettingsIcon, LogOut,
  Target, Brain, AlertTriangle, Building2,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Profile", url: "/profile", icon: User },
  { title: "Projects", url: "/projects", icon: FolderGit2 },
  { title: "Skills", url: "/skills", icon: Wrench },
  { title: "Resume Center", url: "/resumes", icon: FileText },
  { title: "Opportunity Radar", url: "/opportunities", icon: Radar },
  { title: "Job Matches", url: "/job-matches", icon: Target },
  { title: "Applications", url: "/applications", icon: Briefcase },
  { title: "Recruiters", url: "/recruiters", icon: Users },
  { title: "Outreach", url: "/outreach", icon: Send },
  { title: "Interviews", url: "/interviews", icon: Calendar },
  { title: "Interview Prep", url: "/interview-prep", icon: Brain },
  { title: "Pain Points", url: "/painpoints", icon: AlertTriangle },
  { title: "Company Research", url: "/company-research", icon: Building2 },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { signOut } = useAuth();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="h-7 w-7 rounded-md bg-primary/20 grid place-items-center text-primary font-semibold">V</div>
          <span className="font-semibold tracking-tight">Career Compass Pro</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path === item.url}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
