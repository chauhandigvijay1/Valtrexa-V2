import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding — VALTREXA-V2" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <OnboardingWizard mode="page" onComplete={() => nav({ to: "/dashboard" })} />
    </div>
  );
}
