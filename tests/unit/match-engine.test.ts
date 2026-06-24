import { describe, it, expect } from "vitest";
import {
  computeMatchScore,
  scoreSkills,
  scoreRole,
  scoreExperience,
  scoreLocation,
  scoreSalary,
  scoreFreshness,
} from "../../api/_lib/match-engine";

describe("A4 — Match Engine", () => {
  it("scores a strong skills overlap highly", () => {
    const score = scoreSkills(
      ["React", "TypeScript", "Node.js", "PostgreSQL"],
      "We need a React + TypeScript engineer comfortable with Node.js and PostgreSQL.",
    );
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it("penalizes missing skills", () => {
    const score = scoreSkills(["Python", "Django"], "React, TypeScript, AWS required.");
    expect(score).toBeLessThanOrEqual(10);
  });

  it("matches candidate preferred roles to job normalized roles", () => {
    expect(
      scoreRole(
        ["Frontend Developer", "React Developer"],
        ["Frontend Developer"],
        "Frontend Developer",
      ),
    ).toBeGreaterThanOrEqual(80);
    expect(
      scoreRole(["Backend Developer"], ["Frontend Developer"], "Frontend Developer"),
    ).toBeLessThan(50);
  });

  it("scores experience above required as high", () => {
    expect(scoreExperience(7, "5+ Years")).toBeGreaterThanOrEqual(85);
    expect(scoreExperience(1, "5+ Years")).toBeLessThan(60);
  });

  it("treats remote jobs as location-agnostic", () => {
    expect(scoreLocation(["Bengaluru"], "San Francisco", "remote")).toBeGreaterThanOrEqual(90);
  });

  it("rewards salary overlap", () => {
    expect(scoreSalary(120000, 100000, 140000)).toBeGreaterThanOrEqual(90);
    expect(scoreSalary(200000, 100000, 120000)).toBeLessThanOrEqual(60);
  });

  it("decays freshness by bucket", () => {
    expect(scoreFreshness("24h")).toBeGreaterThan(scoreFreshness("30d"));
    expect(scoreFreshness("older")).toBeLessThan(scoreFreshness("7d"));
  });

  it("blends factors into a 0-100 composite", () => {
    const breakdown = computeMatchScore({
      resume: {
        skills: ["React", "TypeScript", "Node.js"],
        preferred_roles: ["Frontend Developer"],
        preferred_locations: ["Remote"],
        years_experience: 4,
        salary_expectation: 120000,
      },
      job: {
        title: "Frontend Developer",
        description: "React TypeScript Node.js frontend engineer.",
        company_name: "Acme",
        location: "Remote",
        normalized_roles: ["Frontend Developer"],
        experience_level: "3-5 Years",
        work_mode: "remote",
        salary_min: 110000,
        salary_max: 150000,
        freshness_bucket: "3d",
        easy_apply: true,
      },
    });
    expect(breakdown.score).toBeGreaterThanOrEqual(80);
    expect(breakdown.score).toBeLessThanOrEqual(100);
    expect(breakdown.skillsScore).toBeGreaterThanOrEqual(80);
    expect(breakdown.roleScore).toBeGreaterThanOrEqual(80);
  });
});
