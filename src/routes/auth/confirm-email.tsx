import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/confirm-email")({
  head: () => ({ meta: [{ title: "Check your email — VALTREXA-V2" }] }),
  component: ConfirmEmailPage,
});

function ConfirmEmailPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-sm text-center space-y-4">
        <div className="rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mx-auto">
          <svg
            className="w-8 h-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent you a confirmation link. Click the link in the email to activate your account,
          then sign in.
        </p>
        <Link to="/login" className="inline-block text-sm text-primary hover:underline">
          Return to sign in
        </Link>
      </div>
    </div>
  );
}
