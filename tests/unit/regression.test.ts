import { describe, it, expect } from "vitest";
import {
  normalizeProjects,
  sanitizeParsedResume,
  heuristicResumeParse,
  type ResumeStructuredData,
  type ResumeProject,
} from "../../api/_lib/resume-parser";

function makeHeuristic(overrides?: Partial<ResumeStructuredData>): ResumeStructuredData {
  return {
    name: "Test User",
    email: "test@example.com",
    phone: null,
    location: "San Francisco",
    summary: null,
    skills: ["React", "TypeScript"],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    github_url: "https://github.com/test",
    linkedin_url: null,
    portfolio_url: null,
    preferred_roles: ["Frontend Developer"],
    preferred_locations: ["San Francisco"],
    salary_expectation: null,
    career_goal: null,
    communication_style: null,
    confidence_score: 0.8,
    ...overrides,
  };
}

describe("Bug #1 — Resume Project URL Deduplication", () => {
  it("eliminates duplicate github_url across AI projects", () => {
    const heuristics = makeHeuristic({
      projects: [
        {
          name: "Project A",
          github_url: "https://github.com/user/project-a",
          live_url: null,
          description: "Desc A",
          tech_stack: ["React"],
          features: ["Feature 1"],
          summary: "Desc A",
        },
        {
          name: "Project B",
          github_url: "https://github.com/user/project-b",
          live_url: null,
          description: "Desc B",
          tech_stack: ["Node"],
          features: ["Feature 2"],
          summary: "Desc B",
        },
      ],
    });

    const aiProjects = [
      {
        name: "Project A",
        github_url: "https://github.com/user/project-a",
        live_url: null,
        description: "Desc A",
        tech_stack: ["React"],
        features: ["Feature 1"],
        summary: "Desc A",
      },
      {
        name: "Project B",
        github_url: "https://github.com/user/project-a",
        live_url: null,
        description: "Desc B",
        tech_stack: ["Node"],
        features: ["Feature 2"],
        summary: "Desc B",
      },
    ];

    const result = normalizeProjects(aiProjects, heuristics);

    expect(result).toHaveLength(2);
    expect(result[0].github_url).toBe("https://github.com/user/project-a");
    expect(result[1].github_url).toBe("https://github.com/user/project-b");
  });

  it("eliminates duplicate live_url across AI projects", () => {
    const heuristics = makeHeuristic({
      projects: [
        {
          name: "MyApp",
          github_url: null,
          live_url: "https://myapp.com",
          description: "Full stack app",
          tech_stack: ["React"],
          features: [],
          summary: "Full stack app",
        },
        {
          name: "Dashboard",
          github_url: null,
          live_url: "https://dashboard.example.com",
          description: "Admin dashboard",
          tech_stack: ["Vue"],
          features: [],
          summary: "Admin dashboard",
        },
      ],
    });

    const aiProjects = [
      {
        name: "MyApp",
        github_url: null,
        live_url: "https://myapp.com",
        description: "Full stack app",
        tech_stack: ["React"],
        features: [],
        summary: "Full stack app",
      },
      {
        name: "Dashboard",
        github_url: null,
        live_url: "https://myapp.com",
        description: "Admin dashboard",
        tech_stack: ["Vue"],
        features: [],
        summary: "Admin dashboard",
      },
    ];

    const result = normalizeProjects(aiProjects, heuristics);

    expect(result[0].live_url).toBe("https://myapp.com");
    expect(result[1].live_url).toBe("https://dashboard.example.com");
  });

  it("sets second duplicate to null when both AI and heuristic have same URL", () => {
    const heuristics = makeHeuristic({
      projects: [
        {
          name: "App1",
          github_url: "https://github.com/user/dup",
          live_url: null,
          description: "Desc",
          tech_stack: [],
          features: [],
          summary: "Desc",
        },
        {
          name: "App2",
          github_url: "https://github.com/user/dup",
          live_url: null,
          description: "Desc",
          tech_stack: [],
          features: [],
          summary: "Desc",
        },
      ],
    });

    const result = normalizeProjects(
      [
        {
          name: "App1",
          github_url: "https://github.com/user/dup",
          live_url: null,
          description: "Desc",
          tech_stack: [],
          features: [],
          summary: "Desc",
        },
        {
          name: "App2",
          github_url: "https://github.com/user/dup",
          live_url: null,
          description: "Desc",
          tech_stack: [],
          features: [],
          summary: "Desc",
        },
      ],
      heuristics,
    );

    expect(result[0].github_url).toBe("https://github.com/user/dup");
    expect(result[1].github_url).toBeNull();
  });

  it("falls back to heuristic URL when AI duplicates and heuristic has distinct URL", () => {
    const heuristics = makeHeuristic({
      projects: [
        {
          name: "Portfolio",
          github_url: "https://github.com/user/portfolio",
          live_url: "https://portfolio.example.com",
          description: "My portfolio",
          tech_stack: ["React"],
          features: ["Responsive"],
          summary: "My portfolio",
        },
        {
          name: "Ecommerce",
          github_url: "https://github.com/user/ecommerce",
          live_url: "https://shop.example.com",
          description: "Online shop",
          tech_stack: ["Next.js"],
          features: ["Cart"],
          summary: "Online shop",
        },
      ],
    });

    const aiProjects = [
      {
        name: "Portfolio",
        github_url: "https://github.com/user/portfolio",
        live_url: null,
        description: "My portfolio",
        tech_stack: ["React"],
        features: ["Responsive"],
        summary: "My portfolio",
      },
      {
        name: "Ecommerce",
        github_url: "https://github.com/user/portfolio",
        live_url: null,
        description: "Online shop",
        tech_stack: ["Next.js"],
        features: ["Cart"],
        summary: "Online shop",
      },
    ];

    const result = normalizeProjects(aiProjects, heuristics);

    expect(result[0].github_url).toBe("https://github.com/user/portfolio");
    expect(result[1].github_url).toBe("https://github.com/user/ecommerce");
  });

  it("sets github_url to null when both AI and heuristic have same duplicate", () => {
    const heuristics = makeHeuristic({
      projects: [
        {
          name: "A",
          github_url: "https://github.com/user/dup",
          live_url: null,
          description: "A",
          tech_stack: [],
          features: [],
          summary: "A",
        },
        {
          name: "B",
          github_url: "https://github.com/user/dup",
          live_url: null,
          description: "B",
          tech_stack: [],
          features: [],
          summary: "B",
        },
      ],
    });

    const result = normalizeProjects(
      [
        {
          name: "A",
          github_url: "https://github.com/user/dup",
          live_url: null,
          description: "A",
          tech_stack: [],
          features: [],
          summary: "A",
        },
        {
          name: "B",
          github_url: "https://github.com/user/dup",
          live_url: null,
          description: "B",
          tech_stack: [],
          features: [],
          summary: "B",
        },
      ],
      heuristics,
    );

    expect(result[0].github_url).toBe("https://github.com/user/dup");
    expect(result[1].github_url).toBeNull();
  });
});

describe("Bug #1 — Heuristic Project Split Regex", () => {
  it("splits projects with numbered titles like '1. Project Name'", () => {
    const text = `Projects
1. Ecommerce Platform - built a full-stack ecommerce platform using React and Node.js
https://github.com/user/ecommerce

2. Dashboard App - admin dashboard with real-time analytics
https://dashboard.example.com

3. Mobile API - REST API for mobile applications
https://github.com/user/mobile-api`;

    const result = heuristicResumeParse(text);
    expect(result.projects.length).toBeGreaterThanOrEqual(3);
    expect(result.projects[0].name).toMatch(/Ecommerce/i);
    expect(result.projects[1].name).toMatch(/Dashboard/i);
    expect(result.projects[2].name).toMatch(/Mobile/i);
  });

  it("splits projects with standard capital-letter titles separated by dash", () => {
    const text = `Projects
Portfolio Site - personal portfolio built with Next.js
https://github.com/user/portfolio

Task Manager - kanban-style task management app
https://tasks.example.com`;

    const result = heuristicResumeParse(text);
    expect(result.projects.length).toBeGreaterThanOrEqual(2);
    expect(result.projects[0].name).toMatch(/Portfolio/i);
    expect(result.projects[1].name).toMatch(/Task/i);
  });
});

describe("Bug #2 — Preferred Roles Persistence", () => {
  it("sanitizeParsedResume merges AI roles with heuristic roles", () => {
    const rawText = "Experienced React developer with Node.js background.";
    const parsed: Partial<ResumeStructuredData> = {
      preferred_roles: ["Frontend Developer", "React Developer"],
    };

    const result = sanitizeParsedResume(parsed, rawText);
    expect(result.preferred_roles).toContain("Frontend Developer");
    expect(result.preferred_roles).toContain("React Developer");
  });

  it("sanitizeParsedResume deduplicates roles", () => {
    const rawText = "Software engineer skilled in React and Node.js";
    const parsed: Partial<ResumeStructuredData> = {
      preferred_roles: ["Full Stack Developer", "Full Stack Developer"],
    };

    const result = sanitizeParsedResume(parsed, rawText);
    const fullStackCount = result.preferred_roles.filter(
      (r) => r.toLowerCase() === "full stack developer",
    ).length;
    expect(fullStackCount).toBe(1);
  });
});

describe("Bug #3 — Preferred Locations Propagation", () => {
  it("sanitizeParsedResume merges locations from AI input and parsed.location", () => {
    const rawText = "Some resume text with no location";
    const parsed: Partial<ResumeStructuredData> = {
      preferred_locations: ["New York", "Remote"],
    };

    const result = sanitizeParsedResume(parsed, rawText);
    expect(result.preferred_locations).toContain("New York");
    expect(result.preferred_locations).toContain("Remote");
  });

  it("deduplicates preferred_locations", () => {
    const rawText = "Bangalore, India";
    const parsed: Partial<ResumeStructuredData> = {
      preferred_locations: ["Bangalore", "bangalore"],
    };

    const result = sanitizeParsedResume(parsed, rawText);
    const bangaloreCount = result.preferred_locations.filter(
      (l) => l.toLowerCase() === "bangalore",
    ).length;
    expect(bangaloreCount).toBe(1);
  });
});

describe("Bug #4 — Cookie Workflow Prereq Check", () => {
  it("validatePrerequisites uses async checkProviderCookie instead of sync-only checkProviderCookieSync", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("api/_lib/workflow-runner.ts", "utf-8");
    expect(src).not.toContain("checkProviderCookieSync");
    expect(src).toContain("checkProviderCookie(userId, provider)");
  });
});
