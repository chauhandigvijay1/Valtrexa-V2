import * as Sentry from "@sentry/node";

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    beforeSend(event) {
      const url = event.request?.url ?? "";
      if (
        url.includes("/health") ||
        url.includes("/healthz") ||
        url.includes("/telegram/webhook")
      ) {
        return null;
      }
      return event;
    },
  });
}
