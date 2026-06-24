import { describe, it, expect } from "vitest";
import { STRATEGY_CONFIG, type BatchStrategy } from "../../api/_lib/batch-apply-engine";

describe("A8 — Batch Apply Engine strategies", () => {
  it("conservative only allows Tier A + easy-apply + fresh jobs", () => {
    const c = STRATEGY_CONFIG.conservative;
    expect(c.tiers).toEqual(["A"]);
    expect(c.easyApplyOnly).toBe(true);
    expect(c.freshness).toEqual(["24h", "3d"]);
    expect(c.minMatchScore).toBeGreaterThanOrEqual(85);
    expect(c.approvalDefault).toBe(true);
  });

  it("balanced allows Tier A + B and a wider freshness window", () => {
    const c = STRATEGY_CONFIG.balanced;
    expect(c.tiers).toEqual(["A", "B"]);
    expect(c.easyApplyOnly).toBe(false);
    expect(c.freshness).toContain("7d");
    expect(c.minMatchScore).toBeGreaterThanOrEqual(70);
  });

  it("aggressive allows Tier A + B + C and the full freshness range", () => {
    const c = STRATEGY_CONFIG.aggressive;
    expect(c.tiers).toEqual(["A", "B", "C"]);
    expect(c.freshness).toContain("30d");
    expect(c.minMatchScore).toBeLessThan(STRATEGY_CONFIG.balanced.minMatchScore);
    expect(c.approvalDefault).toBe(false);
  });

  it("strategy strictness decreases conservative → balanced → aggressive", () => {
    const order: BatchStrategy[] = ["conservative", "balanced", "aggressive"];
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(STRATEGY_CONFIG[order[i]].tiers.length).toBeLessThanOrEqual(
        STRATEGY_CONFIG[order[i + 1]].tiers.length,
      );
      expect(STRATEGY_CONFIG[order[i]].minMatchScore).toBeGreaterThanOrEqual(
        STRATEGY_CONFIG[order[i + 1]].minMatchScore,
      );
    }
  });
});
