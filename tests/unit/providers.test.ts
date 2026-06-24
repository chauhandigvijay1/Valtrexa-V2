import { describe, it, expect } from "vitest";
import {
  getProvider,
  PROVIDER_REGISTRY,
  isKnownProvider,
  type JobProvider,
  type RecruiterProvider,
  type ApplicationProvider,
} from "../../api/_lib/providers";

describe("A3 — Provider Abstraction", () => {
  it("registers all 9 required providers", () => {
    expect(PROVIDER_REGISTRY).toContain("greenhouse");
    expect(PROVIDER_REGISTRY).toContain("lever");
    expect(PROVIDER_REGISTRY).toContain("ashby");
    expect(PROVIDER_REGISTRY).toContain("workable");
    expect(PROVIDER_REGISTRY).toContain("linkedin");
    expect(PROVIDER_REGISTRY).toContain("indeed");
    expect(PROVIDER_REGISTRY).toContain("naukri");
    expect(PROVIDER_REGISTRY).toContain("wellfound");
    expect(PROVIDER_REGISTRY).toContain("instahyre");
    expect(PROVIDER_REGISTRY.length).toBe(9);
  });

  it("every provider implements all three interfaces", () => {
    for (const name of PROVIDER_REGISTRY) {
      const provider = getProvider(name);
      expect(typeof provider.importJobs).toBe("function");
      expect(typeof provider.discoverRecruiters).toBe("function");
      expect(typeof provider.submitApplication).toBe("function");
      expect(provider.capabilities).toBeDefined();
      expect(typeof provider.authMethod).toBe("string");
    }
  });

  it("ATS providers use public_board auth and do not support applications", () => {
    for (const name of ["greenhouse", "lever", "ashby", "workable"]) {
      const provider = getProvider(name) as JobProvider & ApplicationProvider;
      expect(provider.authMethod).toBe("public_board");
      expect(provider.capabilities.applicationsSupported).toBe(false);
    }
  });

  it("scrape providers require session_cookie auth and support applications", () => {
    for (const name of ["linkedin", "indeed", "naukri", "wellfound", "instahyre"]) {
      const provider = getProvider(name) as JobProvider & ApplicationProvider;
      expect(provider.authMethod).toBe("session_cookie");
      expect(provider.capabilities.applicationsSupported).toBe(true);
    }
  });

  it("returns READY_FOR_CREDENTIALS when missing config", async () => {
    const greenhouse = getProvider("greenhouse");
    const r = await greenhouse.importJobs({});
    expect(r.status).toBe("READY_FOR_CREDENTIALS");
    expect(r.jobs).toEqual([]);

    const linkedin = getProvider("linkedin");
    const r2 = await linkedin.importJobs({ searchUrl: "https://linkedin.com/jobs" });
    expect(r2.status).toBe("READY_FOR_CREDENTIALS");
  });

  it("isKnownProvider guards against unknown sources", () => {
    expect(isKnownProvider("greenhouse")).toBe(true);
    expect(isKnownProvider("Workable")).toBe(true); // case-insensitive
    expect(isKnownProvider("monster")).toBe(false);
  });

  it("throws for unknown providers", () => {
    expect(() => getProvider("monster")).toThrow(/Unknown provider/);
  });
});
