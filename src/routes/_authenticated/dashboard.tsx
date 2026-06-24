import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Activity,
  Rocket,
  ArrowRight,
} from "lucide-react";
import { apiGet } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — VALTREXA-V2" }] }),
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

function EmptyState() {
  return (
    <Card className="col-span-full p-8">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Rocket className="mb-4 h-10 w-10 text-muted-foreground/40" />
        <h3 className="mb-1 text-lg font-medium text-foreground">Your pipeline is empty</h3>
        <p className="mb-4 max-w-md text-sm text-muted-foreground">
          Import your first resume, connect job sources, and VALTREXA-V2 will start matching you
          with opportunities. Track applications, interviews, offers, and outreach — all in one
          place.
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Resumes &rarr; upload your CV
          </span>
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Providers &rarr; connect job sources
          </span>
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Radar &rarr; discover opportunities
          </span>
        </div>
      </div>
    </Card>
  );
}

function Dashboard() {
  const { data, isLoading } = useQuery({
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
  const hasData = s.applications > 0 || s.interviews > 0 || s.offers > 0 || s.rejections > 0;
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={hasData ? "Your career pipeline at a glance." : undefined}
      />
      {!isLoading && !hasData ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Briefcase} label="Applications" value={s.applications} />
            <Stat icon={Calendar} label="Interviews" value={s.interviews} />
            <Stat icon={CheckCircle2} label="Offers" value={s.offers} accent="text-success" />
            <Stat
              icon={XCircle}
              label="Rejections"
              value={s.rejections}
              accent="text-destructive"
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Stat icon={TrendingUp} label="Response rate" value={`${s.responseRate}%`} />
            <Stat icon={Activity} label="Interview rate" value={`${s.interviewRate}%`} />
          </div>
        </>
      )}
    </div>
  );
}
