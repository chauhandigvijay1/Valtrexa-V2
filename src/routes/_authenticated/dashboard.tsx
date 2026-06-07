import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Briefcase, Calendar, CheckCircle2, XCircle, TrendingUp, Activity } from "lucide-react";
import { apiGet } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Career Compass Pro" }] }),
  component: Dashboard,
});

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent ?? "text-primary"}`} />
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    </Card>
  );
}

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () =>
      apiGet<{
        applications: number;
        interviews: number;
        offers: number;
        rejections: number;
        responseRate: number;
        interviewRate: number;
      }>("/api/analytics/summary"),
  });
  const s = data ?? {
    applications: 0,
    interviews: 0,
    offers: 0,
    rejections: 0,
    responseRate: 0,
    interviewRate: 0,
  };
  return (
    <div>
      <PageHeader title="Dashboard" description="Your career pipeline at a glance." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Briefcase} label="Applications" value={s.applications} />
        <Stat icon={Calendar} label="Interviews" value={s.interviews} />
        <Stat icon={CheckCircle2} label="Offers" value={s.offers} accent="text-emerald-400" />
        <Stat icon={XCircle} label="Rejections" value={s.rejections} accent="text-rose-400" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Stat icon={TrendingUp} label="Response rate" value={`${s.responseRate}%`} />
        <Stat icon={Activity} label="Interview rate" value={`${s.interviewRate}%`} />
      </div>
    </div>
  );
}
