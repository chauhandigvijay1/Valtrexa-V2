import { describe, it, expect } from "vitest";
import { computeStrategicValue } from "../../api/_lib/high-value-engine";

describe("A5 — High Value Engine", () => {
  it("classifies a well-funded, fast-growing company as High Value", () => {
    const result = computeStrategicValue({
      hiringSignals: ["expanding engineering team", "raised series B", "hiring 10+ roles"],
      fundingData: { status: "Series B", amount: 40_000_000 },
      growthSignals: { headcount: "+35%", traffic: "+20%" },
      openJobCount: 30,
      recruiterDensity: 5,
      techStack: ["React", "TypeScript", "Node.js", "AWS", "PostgreSQL", "Kubernetes"],
      recentNews: "Acme raised $40M Series B led by Sequoia, expanding the platform team.",
      companyResearch: {
        summary:
          "Fast-growing developer tooling company with a strong engineering culture and an expanding platform team.",
      },
      painPoints: [{ severity: 4 }, { severity: 5 }],
      companyQualityScore: 85,
    });
    expect(result.strategicValueScore).toBeGreaterThanOrEqual(68);
    expect(result.valueTier).toBe("HIGH");
  });

  it("classifies a thin-profile company as Normal", () => {
    const result = computeStrategicValue({
      hiringSignals: [],
      fundingData: null,
      growthSignals: null,
      openJobCount: 1,
      recruiterDensity: 0,
      techStack: [],
      recentNews: null,
      companyResearch: null,
      painPoints: [],
      companyQualityScore: 40,
    });
    expect(result.strategicValueScore).toBeLessThan(58);
    expect(["normal", "LOW"]).toContain(result.valueTier);
  });

  it("rewards pain points (we can help) but caps the contribution", () => {
    const low = computeStrategicValue({ painPoints: [] });
    const high = computeStrategicValue({
      painPoints: [{ severity: 5 }, { severity: 5 }, { severity: 5 }],
    });
    expect(high.strategicValueScore).toBeGreaterThan(low.strategicValueScore);
  });

  it("penalizes negative news sentiment", () => {
    const positive = computeStrategicValue({
      recentNews: "Acme raised a Series C and is hiring aggressively.",
    });
    const negative = computeStrategicValue({
      recentNews: "Acme announced major layoffs last quarter.",
    });
    expect(positive.strategicValueScore).toBeGreaterThan(negative.strategicValueScore);
  });
});
