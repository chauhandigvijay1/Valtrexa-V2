import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const envBackup: Record<string, string | undefined> = {};

beforeAll(() => {
  envBackup.SUPABASE_URL = process.env.SUPABASE_URL;
  envBackup.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  envBackup.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
});

afterAll(() => {
  if (envBackup.SUPABASE_URL !== undefined) process.env.SUPABASE_URL = envBackup.SUPABASE_URL;
  else delete process.env.SUPABASE_URL;
  if (envBackup.SUPABASE_SERVICE_ROLE_KEY !== undefined)
    process.env.SUPABASE_SERVICE_ROLE_KEY = envBackup.SUPABASE_SERVICE_ROLE_KEY;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envBackup.OPENROUTER_API_KEY !== undefined)
    process.env.OPENROUTER_API_KEY = envBackup.OPENROUTER_API_KEY;
  else delete process.env.OPENROUTER_API_KEY;
});

describe("P1 — Playwright Auto Apply", () => {
  it("exports expected functions", async () => {
    const mod = await import("../../api/_lib/playwright-apply");
    expect(mod.applyWithPlaywright).toBeDefined();
    expect(mod.continuePlaywrightSubmit).toBeDefined();
    expect(mod.recordPlaywrightApplyResult).toBeDefined();
    expect(mod.getApplyEvidence).toBeDefined();
  });

  it(
    "applyWithPlaywright handles gracefully without browser binary",
    { timeout: 30000 },
    async () => {
      const mod = await import("../../api/_lib/playwright-apply");
      const result = await mod.applyWithPlaywright({
        userId: "test-user",
        applicationId: "test-app",
        jobUrl: "https://linkedin.com/jobs/view/123",
        provider: "linkedin",
        headless: true,
      });
      expect(["FAILED", "PARTIAL"]).toContain(result.status);
    },
  );

  it(
    "continuePlaywrightSubmit handles gracefully without browser binary",
    { timeout: 30000 },
    async () => {
      const mod = await import("../../api/_lib/playwright-apply");
      const result = await mod.continuePlaywrightSubmit({
        userId: "test-user",
        applicationId: "test-app",
        jobUrl: "https://linkedin.com/jobs/view/123",
        provider: "linkedin",
        headless: true,
      });
      expect(["FAILED", "PARTIAL"]).toContain(result.status);
    },
  );

  it("recordPlaywrightApplyResult calls insert on supabase", async () => {
    const mod = await import("../../api/_lib/playwright-apply");
    const supabaseMod = await import("../../api/_lib/supabase");
    const supabase = supabaseMod.supabaseAdmin;

    const insertSpy = vi.spyOn(supabase, "from").mockImplementation(
      () =>
        ({
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "test-evidence-id" }, error: null }),
          order: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          limit: vi.fn().mockReturnThis(),
        }) as any,
    );

    await mod.recordPlaywrightApplyResult({
      userId: "test-user",
      applicationId: "test-app",
      provider: "linkedin",
      result: {
        status: "APPLIED",
        submittedFields: 10,
        totalFields: 12,
        trackingUrl: "https://linkedin.com/jobs/view/123",
      },
    });

    expect(insertSpy).toHaveBeenCalled();
    insertSpy.mockRestore();
  });
});
