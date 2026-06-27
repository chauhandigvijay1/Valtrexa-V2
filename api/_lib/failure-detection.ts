import { Page } from "playwright";
import { ProviderName, recordProviderFailure, logHealthEvent } from "./provider-controls.js";

// ─── Failure Patterns ─────────────────────────────────────

export type FailureType =
  | "cookie_expired"
  | "session_expired"
  | "login_redirect"
  | "captcha_detected"
  | "anti_bot_page"
  | "selector_failure"
  | "missing_button"
  | "layout_change"
  | "upload_failure"
  | "submission_failure"
  | "stuck_workflow"
  | "stuck_queue"
  | "repeated_retries"
  | "provider_downtime";

export interface FailureResult {
  type: FailureType;
  detected: boolean;
  confidence: number;
  evidence?: string;
}

// ─── Detection Patterns ───────────────────────────────────

const CAPTCHA_PATTERNS = [
  /captcha/i,
  /recaptcha/i,
  /hcaptcha/i,
  /verify.*(you|human)/i,
  /security.*check/i,
  /i.?m not a robot/i,
  /enterprise\.hcaptcha/i,
  /g-recaptcha/i,
  /cf-turnstile/i,
  /challenge-platform/i,
];

const ANTI_BOT_PATTERNS = [
  /access denied/i,
  /blocked/i,
  /automated.*access.*denied/i,
  /too many requests/i,
  /rate limited/i,
  /please.*wait/i,
  /unusual traffic/i,
  /automated.*queries/i,
  /403 forbidden/i,
  /this page.*not accessible/i,
  /sorry.*unable/i,
  /pardon.*interruption/i,
];

const LOGIN_REDIRECT_PATTERNS = [
  /sign.?in/i,
  /log.?in/i,
  /login/i,
  /auth/i,
  /authenticate/i,
  /oauth/i,
  /session.*expired/i,
  /please.*sign/i,
  /continue.*sign/i,
];

const SESSION_EXPIRED_PATTERNS = [
  /session.*expired/i,
  /session.*timed?out/i,
  /logged.*out/i,
  /sign.?in.*again/i,
  /your session/i,
  /reconnect/i,
  /please.*(log|sign)/i,
];

const COOKIE_EXPIRED_PATTERNS = [
  /cookie.*expired/i,
  /token.*expired/i,
  /invalid.*token/i,
  /credentials.*expired/i,
  /auth.*expired/i,
];

const PROVIDER_DOWNTIME_PATTERNS = [
  /502 bad gateway/i,
  /503 service unavailable/i,
  /504 gateway timeout/i,
  /connection refused/i,
  /connection timed? out/i,
  /this site can.*t be reached/i,
  /server error/i,
  /maintenance/i,
  /down for maintenance/i,
  /temporarily unavailable/i,
];

// ─── Detection Engine ─────────────────────────────────────

export async function detectFailures(
  page: Page,
  url: string,
  provider: ProviderName,
): Promise<FailureResult[]> {
  const results: FailureResult[] = [];
  const html = await page.content();
  const text = (await page.innerText("body").catch(() => "")) || "";
  const currentUrl = page.url();

  const checks: Array<{ type: FailureType; patterns: RegExp[]; detect: () => Promise<boolean> }> = [
    {
      type: "captcha_detected",
      patterns: CAPTCHA_PATTERNS,
      detect: async () => {
        for (const p of CAPTCHA_PATTERNS) if (p.test(html) || p.test(text)) return true;
        const frames = page.frames();
        for (const f of frames) {
          const fhtml = await f.content().catch(() => "");
          if (fhtml && CAPTCHA_PATTERNS.some((p) => p.test(fhtml))) return true;
        }
        return false;
      },
    },
    {
      type: "anti_bot_page",
      patterns: ANTI_BOT_PATTERNS,
      detect: async () => {
        for (const p of ANTI_BOT_PATTERNS) if (p.test(html) || p.test(text)) return true;
        return false;
      },
    },
    {
      type: "login_redirect",
      patterns: LOGIN_REDIRECT_PATTERNS,
      detect: async () => {
        return LOGIN_REDIRECT_PATTERNS.some((p) => p.test(currentUrl) || p.test(html));
      },
    },
    {
      type: "session_expired",
      patterns: SESSION_EXPIRED_PATTERNS,
      detect: async () => {
        return SESSION_EXPIRED_PATTERNS.some((p) => p.test(text));
      },
    },
    {
      type: "cookie_expired",
      patterns: COOKIE_EXPIRED_PATTERNS,
      detect: async () => {
        return COOKIE_EXPIRED_PATTERNS.some((p) => p.test(text));
      },
    },
    {
      type: "provider_downtime",
      patterns: PROVIDER_DOWNTIME_PATTERNS,
      detect: async () => {
        if (PROVIDER_DOWNTIME_PATTERNS.some((p) => p.test(html) || p.test(text))) return true;
        try {
          const resp = await page.request.get(url, { timeout: 10000 });
          if (resp.status() >= 500) return true;
        } catch (err) {
          console.warn("[FailureDetection] provider request check failed", err);
          return true;
        }
        return false;
      },
    },
  ];

  for (const check of checks) {
    const detected = await check.detect();
    if (detected) {
      const evidence =
        check.type === "captcha_detected"
          ? "CAPTCHA challenge present in page"
          : check.type === "anti_bot_page"
            ? "Anti-bot detection triggered"
            : check.type === "login_redirect"
              ? `Redirected to login: ${currentUrl}`
              : check.type === "session_expired"
                ? "Session expired text found"
                : check.type === "cookie_expired"
                  ? "Cookie expiry text found"
                  : check.type === "provider_downtime"
                    ? "Provider returned server error"
                    : "Unknown failure";

      results.push({ type: check.type, detected: true, confidence: 0.9, evidence });
    }
  }

  return results;
}

// ─── Handle Failures ──────────────────────────────────────

export type FailureHandler = (failure: FailureResult, provider: ProviderName) => Promise<void>;

export async function handleFailure(
  failure: FailureResult,
  provider: ProviderName,
  userId: string,
  extraContext?: string,
): Promise<void> {
  const reason = `${failure.type}: ${failure.evidence || extraContext || "No details"}`;

  // Auto-disable for critical failures
  const criticalTypes: FailureType[] = [
    "cookie_expired",
    "session_expired",
    "anti_bot_page",
    "captcha_detected",
    "provider_downtime",
  ];

  const threshold = criticalTypes.includes(failure.type) ? 1 : 3;

  await recordProviderFailure(provider, reason, userId, threshold);
  await logHealthEvent(
    {
      provider,
      event_type: "failure",
      severity: criticalTypes.includes(failure.type) ? "critical" : "warning",
      message: reason,
      details: {
        failure_type: failure.type,
        confidence: failure.confidence,
        evidence: failure.evidence,
      },
    },
    userId,
  );
}

// ─── Run detection & handle ───────────────────────────────

export async function detectAndHandle(
  page: Page,
  url: string,
  provider: ProviderName,
  userId: string,
): Promise<FailureResult[]> {
  const failures = await detectFailures(page, url, provider);

  if (failures.length > 0) {
    for (const f of failures) {
      const criticalTypes: FailureType[] = [
        "cookie_expired",
        "session_expired",
        "anti_bot_page",
        "captcha_detected",
        "provider_downtime",
      ];
      const severity = criticalTypes.includes(f.type) ? "critical" : "warning";

      await recordProviderFailure(
        provider,
        `${f.type}: ${f.evidence || ""}`,
        userId,
        severity === "critical" ? 1 : 3,
      );
      await logHealthEvent(
        {
          provider,
          event_type: "failure",
          severity: severity as any,
          message: `${f.type} detected`,
          details: { failure_type: f.type, evidence: f.evidence, url },
        },
        userId,
      );
    }
  }

  return failures;
}
