import mammoth from "mammoth";
import { callOpenRouterJson } from "./openrouter.js";

export type ResumeStructuredData = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  github_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  preferred_roles: string[];
  preferred_locations: string[];
  salary_expectation: number | null;
  career_goal: string | null;
  communication_style: string | null;
};

export async function extractResumeText(fileName: string, fileBytes: ArrayBuffer) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const canvas = await import("@napi-rs/canvas");
    if (!globalThis.DOMMatrix)
      globalThis.DOMMatrix = canvas.DOMMatrix as typeof globalThis.DOMMatrix;
    if (!globalThis.ImageData)
      globalThis.ImageData = canvas.ImageData as typeof globalThis.ImageData;
    if (!globalThis.Path2D) globalThis.Path2D = canvas.Path2D as typeof globalThis.Path2D;
    if (!(globalThis as any).pdfjsWorker?.WorkerMessageHandler) {
      (globalThis as any).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(fileBytes),
      disableWorker: true,
    } as any);
    const document = await loadingTask.promise;
    try {
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const text = await page.getTextContent();
        pages.push(
          text.items
            .map((item) => ("str" in item ? item.str : ""))
            .filter(Boolean)
            .join(" "),
        );
        page.cleanup();
      }
      return pages.join("\n\n").trim();
    } finally {
      await document.destroy();
    }
  }

  if (lower.endsWith(".docx")) {
    const parsed = await mammoth.extractRawText({ buffer: Buffer.from(fileBytes) });
    return parsed.value ?? "";
  }

  if (lower.endsWith(".tex")) {
    return Buffer.from(fileBytes).toString("utf-8");
  }

  throw new Error("Unsupported resume file type.");
}

const resumeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    skills: { type: "array", items: { type: "string" } },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          start_date: { type: ["string", "null"] },
          end_date: { type: ["string", "null"] },
          is_current: { type: ["boolean", "null"] },
          description: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
        },
        required: [
          "company",
          "title",
          "location",
          "start_date",
          "end_date",
          "is_current",
          "description",
          "summary",
        ],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          github_url: { type: ["string", "null"] },
          live_url: { type: ["string", "null"] },
          tech_stack: { type: "array", items: { type: "string" } },
          summary: { type: ["string", "null"] },
        },
        required: ["name", "description", "github_url", "live_url", "tech_stack", "summary"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          school: { type: ["string", "null"] },
          degree: { type: ["string", "null"] },
          field: { type: ["string", "null"] },
          start_date: { type: ["string", "null"] },
          end_date: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
        },
        required: ["school", "degree", "field", "start_date", "end_date", "description", "summary"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: ["string", "null"] },
          issuer: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
        },
        required: ["name", "issuer", "date", "summary"],
      },
    },
    github_url: { type: ["string", "null"] },
    linkedin_url: { type: ["string", "null"] },
    portfolio_url: { type: ["string", "null"] },
    preferred_roles: { type: "array", items: { type: "string" } },
    preferred_locations: { type: "array", items: { type: "string" } },
    salary_expectation: { type: ["integer", "null"] },
    career_goal: { type: ["string", "null"] },
    communication_style: { type: ["string", "null"] },
  },
  required: [
    "name",
    "email",
    "phone",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
    "github_url",
    "linkedin_url",
    "portfolio_url",
    "preferred_roles",
    "preferred_locations",
    "salary_expectation",
    "career_goal",
    "communication_style",
  ],
} as const;

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function heuristicResumeParse(rawText: string): ResumeStructuredData {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = rawText.match(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,14}\d/)?.[0] ?? null;
  const name = lines[0] && !/@/.test(lines[0]) ? lines[0].slice(0, 120) : null;

  const skillLine = lines.find((line) => /^skills?\s*:/i.test(line));
  const skills = skillLine
    ? uniqueStrings(skillLine.replace(/^skills?\s*:/i, "").split(/[;,|]/))
    : uniqueStrings(
        Array.from(
          rawText.matchAll(
            /\b(TypeScript|JavaScript|React|Next\.js|Node\.js|Node|Supabase|PostgreSQL|Python|AWS|Docker|Kubernetes|GraphQL|Tailwind|Vite|Go|Java|C\+\+|SQL)\b/gi,
          ),
        ).map((match) => match[0]),
      );

  const captureSection = (label: string) =>
    lines
      .filter((line) => new RegExp(`^${label}\\s*:`, "i").test(line))
      .map((line) => line.replace(new RegExp(`^${label}\\s*:`, "i"), "").trim());

  // Simple regex parser for URLs
  const github = rawText.match(/github\.com\/[a-zA-Z0-9_-]+/i)?.[0] ?? null;
  const linkedin = rawText.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i)?.[0] ?? null;
  const portfolio =
    rawText.match(/(?:portfolio|website|site)\s*:\s*(https?:\/\/[^\s]+)/i)?.[1] ?? null;

  return {
    name,
    email,
    phone,
    skills,
    experience: captureSection("experience").map((value) => ({ summary: value })),
    projects: captureSection("projects").map((value) => ({ summary: value })),
    education: captureSection("education").map((value) => ({ summary: value })),
    certifications: captureSection("certifications").map((value) => ({
      name: value,
      issuer: null,
      date: null,
      summary: null,
    })),
    github_url: github ? (github.startsWith("http") ? github : `https://${github}`) : null,
    linkedin_url: linkedin
      ? linkedin.startsWith("http")
        ? linkedin
        : `https://${linkedin}`
      : null,
    portfolio_url: portfolio,
    preferred_roles: [],
    preferred_locations: [],
    salary_expectation: null,
    career_goal: null,
    communication_style: null,
  };
}

export async function parseResumeText(
  rawText: string,
  userId?: string,
): Promise<{
  data: ResumeStructuredData;
  model: string;
  usage: any;
  source: "env" | "integration";
}> {
  try {
    return await callOpenRouterJson<ResumeStructuredData>(
      [
        {
          role: "system",
          content:
            "Extract resume data into a strict JSON object. Use empty arrays when data is missing and null for missing scalars.",
        },
        {
          role: "user",
          content: rawText.slice(0, 120000),
        },
      ],
      "resume_parse",
      resumeSchema,
      { userId },
    );
  } catch (err: any) {
    console.error("OpenRouter parse error:", err.message || err);
    return {
      data: heuristicResumeParse(rawText),
      model: "local-heuristic-parser",
      usage: null,
      source: "env",
    };
  }
}
