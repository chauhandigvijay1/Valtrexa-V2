import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const summary = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () =>
      apiGet<{
        applications: number;
        interviews: number;
        offers: number;
        rejections: number;
        responseRate: number;
        interviewRate: number;
        conversionFunnel: Record<string, number>;
      }>("/api/analytics/summary"),
  });

  const data = summary.data;
  const metrics = [
    { label: "Applications", value: data?.applications ?? 0 },
    { label: "Interviews", value: data?.interviews ?? 0 },
    { label: "Offers", value: data?.offers ?? 0 },
    { label: "Rejections", value: data?.rejections ?? 0 },
    { label: "Response rate", value: `${data?.responseRate ?? 0}%` },
    { label: "Interview rate", value: `${data?.interviewRate ?? 0}%` },
  ];
  const funnel = data?.conversionFunnel ?? {};

  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" description="Real conversion metrics from your live application data." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</div>
            <div className="text-3xl font-semibold mt-2 tabular-nums">{metric.value}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="text-sm font-medium">Conversion Funnel</div>
        <div className="mt-4 grid md:grid-cols-5 gap-3">
          {Object.entries(funnel).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{key}</div>
              <div className="mt-2 text-2xl font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
