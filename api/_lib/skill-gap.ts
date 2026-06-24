import { supabaseAdmin } from "./supabase.js";
import { callOpenRouterJson } from "./openrouter.js";
import { logger } from "./logger.js";

export interface SkillGapResult {
  matched: string[];
  missing: string[];
  partiallyMatched: string[];
  score: number;
  recommendations: SkillRecommendation[];
}

export interface SkillRecommendation {
  skill: string;
  importance: "critical" | "important" | "nice-to-have";
  resources: {
    name: string;
    url: string;
    type: "course" | "documentation" | "practice" | "article";
  }[];
}

const LEARNING_MAP: Record<string, SkillRecommendation["resources"]> = {
  kubernetes: [
    {
      name: "Kubernetes Basics",
      url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/",
      type: "documentation",
    },
    {
      name: "CKA Certification Prep",
      url: "https://www.udemy.com/course/certified-kubernetes-administrator-cka/",
      type: "course",
    },
    {
      name: "Killercoda K8s Scenarios",
      url: "https://killercoda.com/killer-shell-cka",
      type: "practice",
    },
  ],
  docker: [
    {
      name: "Docker Get Started",
      url: "https://docs.docker.com/get-started/",
      type: "documentation",
    },
    { name: "Docker Mastery", url: "https://www.udemy.com/course/docker-mastery/", type: "course" },
    { name: "Play with Docker", url: "https://labs.play-with-docker.com/", type: "practice" },
  ],
  aws: [
    { name: "AWS Free Tier", url: "https://aws.amazon.com/free/", type: "practice" },
    {
      name: "AWS Certified Developer",
      url: "https://aws.amazon.com/certification/certified-developer-associate/",
      type: "course",
    },
    { name: "AWS Documentation", url: "https://docs.aws.amazon.com/", type: "documentation" },
  ],
  terraform: [
    {
      name: "Terraform Tutorials",
      url: "https://developer.hashicorp.com/terraform/tutorials",
      type: "documentation",
    },
    {
      name: "Terraform Up & Running",
      url: "https://www.oreilly.com/library/view/terraform-up-and/9781098116736/",
      type: "article",
    },
  ],
  typescript: [
    {
      name: "TypeScript Handbook",
      url: "https://www.typescriptlang.org/docs/handbook/",
      type: "documentation",
    },
    { name: "TypeScript Deep Dive", url: "https://basarat.gitbook.io/typescript", type: "article" },
  ],
  react: [
    { name: "React Docs", url: "https://react.dev/learn", type: "documentation" },
    { name: "Epic React", url: "https://epicreact.dev/", type: "course" },
    { name: "React Practice", url: "https://reactpractice.dev/", type: "practice" },
  ],
  python: [
    {
      name: "Python Official Tutorial",
      url: "https://docs.python.org/3/tutorial/",
      type: "documentation",
    },
    { name: "Real Python", url: "https://realpython.com/", type: "article" },
  ],
  go: [
    { name: "Go by Example", url: "https://gobyexample.com/", type: "practice" },
    { name: "Effective Go", url: "https://go.dev/doc/effective_go", type: "documentation" },
  ],
  redis: [
    { name: "Redis University", url: "https://university.redis.com/", type: "course" },
    { name: "Redis Docs", url: "https://redis.io/docs/", type: "documentation" },
  ],
  postgres: [
    { name: "PG Exercises", url: "https://pgexercises.com/", type: "practice" },
    { name: "PostgreSQL Tutorial", url: "https://www.postgresqltutorial.com/", type: "article" },
  ],
  graphql: [
    { name: "How to GraphQL", url: "https://www.howtographql.com/", type: "article" },
    { name: "Apollo Odyssey", url: "https://odyssey.apollographql.com/", type: "course" },
  ],
};

const INFRA_SKILLS = new Set([
  "kubernetes",
  "docker",
  "aws",
  "terraform",
  "linux",
  "ci/cd",
  "helm",
  "istio",
  "jenkins",
  "github actions",
]);
const LANG_SKILLS = new Set([
  "typescript",
  "javascript",
  "python",
  "go",
  "java",
  "rust",
  "c++",
  "ruby",
  "php",
]);
const FRONTEND_SKILLS = new Set([
  "react",
  "vue",
  "angular",
  "next.js",
  "css",
  "html",
  "tailwind",
  "redux",
]);
const BACKEND_SKILLS = new Set([
  "node.js",
  "express",
  "nestjs",
  "graphql",
  "rest",
  "fastify",
  "django",
  "flask",
]);
const DB_SKILLS = new Set([
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "supabase",
  "sqlite",
  "dynamodb",
]);
const TOOL_SKILLS = new Set([
  "git",
  "playwright",
  "vite",
  "webpack",
  "babel",
  "eslint",
  "prettier",
  "jest",
]);

function categorizeSkill(skill: string): string {
  const s = skill.toLowerCase().trim();
  if (INFRA_SKILLS.has(s)) return "Infrastructure";
  if (LANG_SKILLS.has(s)) return "Languages";
  if (FRONTEND_SKILLS.has(s)) return "Frontend";
  if (BACKEND_SKILLS.has(s)) return "Backend";
  if (DB_SKILLS.has(s)) return "Databases";
  if (TOOL_SKILLS.has(s)) return "Tools";
  return "Other";
}

function extractSkillsFromText(text: string): string[] {
  const allSkills = new Set([
    ...INFRA_SKILLS,
    ...LANG_SKILLS,
    ...FRONTEND_SKILLS,
    ...BACKEND_SKILLS,
    ...DB_SKILLS,
    ...TOOL_SKILLS,
  ]);
  const lower = text.toLowerCase();
  return [...allSkills].filter((s) =>
    new RegExp(`\\b${s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower),
  );
}

export function analyzeSkillGap(candidateSkills: string[], jobDescription: string): SkillGapResult {
  const jdSkills = extractSkillsFromText(jobDescription);
  const jdSkillSet = new Set(jdSkills.map((s) => s.toLowerCase().trim()));
  const candidateSet = new Set(candidateSkills.map((s) => s.toLowerCase().trim()));

  const matched: string[] = [];
  const missing: string[] = [];
  const partiallyMatched: string[] = [];

  for (const skill of jdSkills) {
    const key = skill.toLowerCase();
    if (candidateSet.has(key)) {
      matched.push(skill);
    } else {
      // Check partial match (e.g., "typescript" vs "typescript/react")
      const partialMatch = [...candidateSet].some((c) => c.includes(key) || key.includes(c));
      if (partialMatch) {
        partiallyMatched.push(skill);
      } else {
        missing.push(skill);
      }
    }
  }

  const total = matched.length + partiallyMatched.length + missing.length;
  const score =
    total > 0 ? Math.round(((matched.length + partiallyMatched.length * 0.5) / total) * 100) : 100;

  const recommendations: SkillRecommendation[] = missing.map((skill) => {
    const key = skill.toLowerCase();
    const importance: "critical" | "important" | "nice-to-have" =
      INFRA_SKILLS.has(key) || LANG_SKILLS.has(key)
        ? "critical"
        : BACKEND_SKILLS.has(key) || FRONTEND_SKILLS.has(key)
          ? "important"
          : "nice-to-have";
    return {
      skill,
      importance,
      resources: LEARNING_MAP[key] ?? [
        {
          name: `Learn ${skill}`,
          url: `https://www.google.com/search?q=${encodeURIComponent(skill + " tutorial")}`,
          type: "article",
        },
        {
          name: `${skill} Documentation`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(skill + " official docs")}`,
          type: "documentation",
        },
      ],
    };
  });

  // Sort: critical first, then important, then nice-to-have
  recommendations.sort((a, b) => {
    const order = { critical: 0, important: 1, "nice-to-have": 2 };
    return order[a.importance] - order[b.importance];
  });

  return { matched, missing, partiallyMatched, score, recommendations };
}

export async function analyzeSkillGapWithAi(
  candidateSkills: string[],
  jobDescription: string,
  userId?: string,
): Promise<SkillGapResult> {
  const basic = analyzeSkillGap(candidateSkills, jobDescription);

  if (!basic.missing.length) return basic;

  try {
    const result = await callOpenRouterJson<{ priority: string; alternativePaths: string[] }[]>(
      [
        {
          role: "system",
          content:
            "You are a career coach. Given missing skills for a job application, rate each as critical/important/nice-to-have and suggest alternative learning paths. Return JSON array of {skill, priority, alternativePaths}.",
        },
        {
          role: "user",
          content: JSON.stringify({
            missingSkills: basic.missing,
            matchedSkills: basic.matched,
            jobDescription: jobDescription.slice(0, 2000),
          }),
        },
      ],
      "skill_gap_analysis",
      {
        type: "array",
        items: {
          type: "object",
          properties: {
            skill: { type: "string" },
            priority: { type: "string", enum: ["critical", "important", "nice-to-have"] },
            alternativePaths: { type: "array", items: { type: "string" } },
          },
          required: ["skill", "priority", "alternativePaths"],
        },
      },
      { userId },
    );

    if (result.data && Array.isArray(result.data)) {
      const aiResults = result.data as Array<{
        skill: string;
        priority: string;
        alternativePaths: string[];
      }>;
      for (const ai of aiResults) {
        const rec = basic.recommendations.find(
          (r) => r.skill.toLowerCase() === ai.skill.toLowerCase(),
        );
        if (rec) {
          rec.importance = ai.priority as any;
          if (ai.alternativePaths?.length) {
            rec.resources = ai.alternativePaths.map((path) => ({
              name: path,
              url: `https://www.google.com/search?q=${encodeURIComponent(path)}`,
              type: "course" as const,
            }));
          }
        }
      }
    }
  } catch (err: any) {
    logger.warn("AI skill gap analysis failed, using basic results", { error: err.message });
  }

  return basic;
}
