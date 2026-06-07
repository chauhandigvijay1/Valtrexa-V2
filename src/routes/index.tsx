import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Briefcase,
  BarChart3,
  Users,
  MessageSquare,
  Calendar,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Career Compass Pro — AI Career Operating System" },
      {
        name: "description",
        content:
          "The career OS for software engineers. Track resumes, jobs, recruiters, outreach, interviews, and analytics in one workspace.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <div className="h-7 w-7 rounded-md bg-primary/20 grid place-items-center text-primary">
              C
            </div>
            Career Compass Pro
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">
                Get started <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Career Operating System
        </div>
        <h1 className="mt-6 text-5xl md:text-6xl font-semibold tracking-tight">
          Your career, <span className="text-primary">engineered</span>.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Career Compass Pro is the workspace where software engineers manage resumes, jobs,
          recruiter relationships, outreach, and analytics without losing track of a single thread.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/signup">
            <Button size="lg">
              Start free <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 grid md:grid-cols-3 gap-4">
        {[
          {
            icon: Briefcase,
            title: "Opportunity Radar",
            desc: "Capture jobs from anywhere with priority and match score.",
          },
          {
            icon: BarChart3,
            title: "Pipeline Analytics",
            desc: "Response rates, interview rates, offers, and funnel conversion.",
          },
          {
            icon: Users,
            title: "Recruiter CRM",
            desc: "A directory of every recruiter, contact note, and follow-up.",
          },
          {
            icon: MessageSquare,
            title: "Outreach Center",
            desc: "Generated outreach, follow-ups, and recruiter-specific messaging.",
          },
          {
            icon: Calendar,
            title: "Interview Tracker",
            desc: "Rounds, preparation notes, assessments, and outcomes.",
          },
          {
            icon: Sparkles,
            title: "Resume Intelligence",
            desc: "Parsed resumes, ATS analysis, and tailored variants per role.",
          },
        ].map((feature) => (
          <div key={feature.title} className="rounded-lg border border-border bg-card p-5">
            <feature.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-medium">{feature.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{feature.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Career Compass Pro
      </footer>
    </div>
  );
}
