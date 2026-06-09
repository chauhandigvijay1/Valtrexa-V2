import mammoth from "mammoth";
import { callOpenRouterJson } from "./openrouter.js";

type ResumeProject = {
  name: string | null;
  description: string | null;
  github_url: string | null;
  live_url: string | null;
  tech_stack: string[];
  features: string[];
  summary: string | null;
};

type ResumeExperience = {
  company: string | null;
  title: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean | null;
  description: string | null;
  summary: string | null;
};

type ResumeEducation = {
  school: string | null;
  degree: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  summary: string | null;
};

type ResumeCertification = {
  name: string | null;
  issuer: string | null;
  date: string | null;
  summary: string | null;
};

export type ResumeStructuredData = {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
  github_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  preferred_roles: string[];
  preferred_locations: string[];
  salary_expectation: number | null;
  career_goal: string | null;
  communication_style: string | null;
  confidence_score: number;
};

function latexToPlainText(source: string) {
  return source
    .replace(/%.*$/gm, "")
    .replace(/\\(?:section|subsection|subsubsection|paragraph)\*?{([^}]*)}/g, "\n$1\n")
    .replace(/\\item\s+/g, "\n- ")
    .replace(/\\\\/g, "\n")
    .replace(/\\href{([^}]*)}{([^}]*)}/g, "$2 $1")
    .replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?(?:{[^}]*})?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SKILL_CATALOG: Record<string, string[]> = {
  Languages: [
    "TypeScript",
    "JavaScript",
    "Python",
    "Java",
    "Go",
    "C++",
    "C#",
    "PHP",
    "Ruby",
    "SQL",
    "HTML",
    "CSS",
  ],
  Frameworks: [
    "React",
    "Next.js",
    "Vue",
    "Angular",
    "Node.js",
    "Express",
    "NestJS",
    "Spring Boot",
    "Django",
    "Flask",
    "FastAPI",
    "Laravel",
  ],
  Libraries: [
    "Redux",
    "TanStack Query",
    "Tailwind CSS",
    "Bootstrap",
    "jQuery",
    "Pandas",
    "NumPy",
    "TensorFlow",
    "PyTorch",
    "GraphQL",
  ],
  Databases: [
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Supabase",
    "Redis",
    "SQLite",
    "DynamoDB",
    "Elasticsearch",
  ],
  Cloud: ["AWS", "Azure", "GCP", "Vercel", "Netlify", "Firebase", "Cloudflare"],
  DevOps: [
    "Docker",
    "Kubernetes",
    "Terraform",
    "GitHub Actions",
    "CI/CD",
    "Jenkins",
    "Linux",
  ],
  Tools: [
    "Git",
    "Figma",
    "Postman",
    "Jira",
    "Notion",
    "Playwright",
    "Vitest",
    "Webpack",
    "Vite",
  ],
};

const ROLE_RULES: Array<{ roles: string[]; requiredSkills: string[] }> = [
  {
    roles: [
      "Full Stack Developer",
      "Full-Stack Developer",
      "MERN Developer",
      "Software Engineer",
      "Web Developer",
    ],
    requiredSkills: ["React", "Node.js"],
  },
  {
    roles: ["Frontend Developer", "React Developer", "Next.js Developer", "Web Developer"],
    requiredSkills: ["React"],
  },
  {
    roles: ["Backend Developer", "Node.js Developer", "Software Engineer"],
    requiredSkills: ["Node.js", "PostgreSQL"],
  },
  {
    roles: ["Java Developer", "Backend Developer", "Software Engineer"],
    requiredSkills: ["Java"],
  },
];

const PROJECT_SECTION_LABELS = [
  "projects",
  "project experience",
  "personal projects",
  "selected projects",
];
const EXPERIENCE_SECTION_LABELS = ["experience", "work experience", "employment", "professional experience"];
const EDUCATION_SECTION_LABELS = ["education", "academics", "academic background"];
const SUMMARY_SECTION_LABELS = ["summary", "professional summary", "profile", "about"];

export async function extractResumeText(fileName: string, fileBytes: ArrayBuffer) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const canvas = await import("@napi-rs/canvas");
    if (!globalThis.DOMMatrix) globalThis.DOMMatrix = canvas.DOMMatrix as typeof globalThis.DOMMatrix;
    if (!globalThis.ImageData) globalThis.ImageData = canvas.ImageData as typeof globalThis.ImageData;
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
    return latexToPlainText(Buffer.from(fileBytes).toString("utf-8"));
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
    location: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
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
          features: { type: "array", items: { type: "string" } },
          summary: { type: ["string", "null"] },
        },
        required: [
          "name",
          "description",
          "github_url",
          "live_url",
          "tech_stack",
          "features",
          "summary",
        ],
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
    confidence_score: { type: ["number", "null"] },
  },
  required: [
    "name",
    "email",
    "phone",
    "location",
    "summary",
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
    "confidence_score",
  ],
} as const;

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeMultiline(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? "");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? "");
    if (normalized) return normalized;
  }
  return null;
}

function scoreToConfidence(presentFields: number, totalFields: number) {
  if (totalFields === 0) return 0;
  return Math.max(0.2, Math.min(0.98, Number((presentFields / totalFields).toFixed(2))));
}

function extractTopLines(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function extractEmail(rawText: string) {
  return rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

function extractPhone(rawText: string) {
  return rawText.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?(?:\d[\s-]?){8,14}\d/)?.[0] ?? null;
}

function extractLinks(rawText: string) {
  const urls = Array.from(rawText.matchAll(/https?:\/\/[^\s)]+/gi)).map((match) => match[0]);
  const github =
    urls.find((url) => /github\.com\//i.test(url)) ??
    rawText.match(/github\.com\/[^\s)]+/i)?.[0] ??
    null;
  const linkedin =
    urls.find((url) => /linkedin\.com\/in\//i.test(url)) ??
    rawText.match(/linkedin\.com\/in\/[^\s)]+/i)?.[0] ??
    null;
  const portfolioCandidate =
    urls.find((url) => !/github\.com|linkedin\.com/i.test(url)) ??
    rawText.match(/(?:portfolio|website|site)\s*:?\s*(https?:\/\/[^\s)]+)/i)?.[1] ??
    null;

  const withProtocol = (value: string | null) =>
    value ? (value.startsWith("http") ? value : `https://${value}`) : null;

  return {
    github_url: withProtocol(github),
    linkedin_url: withProtocol(linkedin),
    portfolio_url: withProtocol(portfolioCandidate),
  };
}

function extractName(rawText: string) {
  const topLines = extractTopLines(rawText);
  return (
    topLines.find((line) => !/@/.test(line) && !/\d{5,}/.test(line) && line.length <= 80) ?? null
  );
}

function isLikelyLocationLine(line: string, name: string | null) {
  const normalized = normalizeWhitespace(line);
  if (!normalized) return false;
  if (name && normalized.toLowerCase() === name.toLowerCase()) return false;
  if (/github|linkedin|portfolio|skills?|summary|profile|about/i.test(normalized)) return false;
  if (/@/.test(normalized) || /\d{5,}/.test(normalized)) return false;
  if (normalized.split(",").length > 3) return false;
  if (
    /\b(?:typescript|javascript|react|next\.?js|node\.?js|supabase|postgresql|mongodb|mysql|aws|azure|gcp|docker|kubernetes|tailwind)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  if (/\b(remote|hybrid|onsite|on-site|relocate|relocation)\b/i.test(normalized)) return true;
  if (/[A-Za-z]+,\s*[A-Za-z]{2,}/.test(normalized)) return true;
  if (/\b(?:india|usa|uk|canada|singapore|australia|germany|france)\b/i.test(normalized)) return true;
  return false;
}

function extractLocation(rawText: string, name: string | null) {
  const topLines = extractTopLines(rawText);
  return topLines.find((line) => isLikelyLocationLine(line, name)) ?? null;
}

function getSection(rawText: string, labels: string[]) {
  const normalized = rawText.replace(/\r/g, "");
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(
    `(?:^|\\n)\\s*(?:${labelPattern})\\s*:?\\s*\\n([\\s\\S]*?)(?=\\n\\s*[A-Z][A-Za-z/& ]{2,}:?\\s*\\n|\\n\\s*(?:${labelPattern})\\s*:?\\s*\\n|$)`,
    "i",
  );
  return normalizeMultiline(normalized.match(regex)?.[1] ?? "");
}

function splitBullets(section: string) {
  return section
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z])/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 5);
}

function extractKnownSkills(rawText: string) {
  const found: string[] = [];
  for (const values of Object.values(SKILL_CATALOG)) {
    for (const skill of values) {
      const pattern = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (pattern.test(rawText)) found.push(skill);
    }
  }
  return uniqueStrings(found);
}

function extractSkills(rawText: string) {
  const skillSection = getSection(rawText, ["skills", "technical skills", "technologies", "stack"]);
  const sectionSkills = skillSection
    ? skillSection
        .split(/[\n,;|]/)
        .map((value) => value.replace(/^[A-Za-z ]+:/, "").trim())
        .filter((value) => value.length > 1)
    : [];
  return uniqueStrings([...sectionSkills, ...extractKnownSkills(rawText)]);
}

function inferPreferredRoles(skills: string[], experience: ResumeExperience[], rawText: string) {
  const normalizedSkills = new Set(skills.map((skill) => skill.toLowerCase()));
  const inferred = new Set<string>();

  for (const rule of ROLE_RULES) {
    if (rule.requiredSkills.every((skill) => normalizedSkills.has(skill.toLowerCase()))) {
      rule.roles.forEach((role) => inferred.add(role));
    }
  }

  for (const item of experience) {
    const title = item.title?.toLowerCase() ?? "";
    if (title.includes("frontend")) inferred.add("Frontend Developer");
    if (title.includes("backend")) inferred.add("Backend Developer");
    if (title.includes("full stack") || title.includes("full-stack")) inferred.add("Full Stack Developer");
    if (title.includes("software engineer")) inferred.add("Software Engineer");
  }

  if (/mern/i.test(rawText)) inferred.add("MERN Developer");
  if (/next\.?js/i.test(rawText)) inferred.add("Next.js Developer");
  if (/react/i.test(rawText)) inferred.add("React Developer");
  if (/node\.?js/i.test(rawText)) inferred.add("Node.js Developer");
  if (/java/i.test(rawText)) inferred.add("Java Developer");

  return Array.from(inferred).slice(0, 8);
}

function inferProjectTech(projectText: string, knownSkills: string[]) {
  return uniqueStrings(
    knownSkills.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(projectText)),
  );
}

function inferProjects(rawText: string, skills: string[]) {
  const section = getSection(rawText, PROJECT_SECTION_LABELS);
  if (!section) return [];
  const chunks = section
    .split(/\n(?=[A-Z][^\n]{3,80}(?:\n| - |:))/)
    .map((chunk) => normalizeMultiline(chunk))
    .filter(Boolean);

  return chunks.slice(0, 8).map((chunk) => {
    const lines = chunk.split("\n").filter(Boolean);
    const heading = lines[0]?.replace(/^[-*•]\s*/, "").trim() ?? "Project";
    const urls = Array.from(chunk.matchAll(/https?:\/\/[^\s)]+/gi)).map((match) => match[0]);
    const github = urls.find((url) => /github\.com/i.test(url)) ?? null;
    const live = urls.find((url) => !/github\.com/i.test(url)) ?? null;
    const features = splitBullets(lines.slice(1).join("\n")).slice(0, 6);
    const description = firstNonEmpty(features[0], lines.slice(1).join(" "));
    return {
      name: heading,
      description,
      github_url: github,
      live_url: live,
      tech_stack: inferProjectTech(chunk, skills),
      features,
      summary: description,
    } satisfies ResumeProject;
  });
}

function inferExperiences(rawText: string) {
  const section = getSection(rawText, EXPERIENCE_SECTION_LABELS);
  if (!section) return [];
  const chunks = section
    .split(/\n(?=[A-Z][^\n]{3,100}(?:\n| - | at ))/)
    .map((chunk) => normalizeMultiline(chunk))
    .filter(Boolean);

  return chunks.slice(0, 10).map((chunk) => {
    const lines = chunk.split("\n").filter(Boolean);
    const header = lines[0] ?? "";
    const titleCompany = header.split(/\s+(?:at|@|-)\s+/i);
    const title = titleCompany[0] ?? null;
    const company = titleCompany[1] ?? null;
    const description = lines.slice(1).join(" ");
    const isCurrent = /present|current/i.test(chunk);
    return {
      company: firstNonEmpty(company),
      title: firstNonEmpty(title),
      location: null,
      start_date: null,
      end_date: null,
      is_current: isCurrent,
      description: firstNonEmpty(description),
      summary: firstNonEmpty(description),
    } satisfies ResumeExperience;
  });
}

function inferEducation(rawText: string) {
  const section = getSection(rawText, EDUCATION_SECTION_LABELS);
  if (!section) return [];
  return splitBullets(section).slice(0, 6).map((line) => ({
    school: line,
    degree: null,
    field: null,
    start_date: null,
    end_date: null,
    description: null,
    summary: line,
  }));
}

function inferSummary(rawText: string) {
  const section = getSection(rawText, SUMMARY_SECTION_LABELS);
  if (section) return splitBullets(section).slice(0, 3).join(" ");
  const topLines = extractTopLines(rawText).filter(
    (line) =>
      !/@/.test(line) &&
      !/github|linkedin|portfolio/i.test(line) &&
      line.length > 20 &&
      line.length < 200,
  );
  return topLines[1] ?? null;
}

function heuristicResumeParse(rawText: string): ResumeStructuredData {
  const email = extractEmail(rawText);
  const phone = extractPhone(rawText);
  const name = extractName(rawText);
  const location = extractLocation(rawText, name);
  const summary = inferSummary(rawText);
  const skills = extractSkills(rawText);
  const experience = inferExperiences(rawText);
  const projects = inferProjects(rawText, skills);
  const education = inferEducation(rawText);
  const certifications = splitBullets(getSection(rawText, ["certifications", "licenses"])).map((item) => ({
    name: item,
    issuer: null,
    date: null,
    summary: item,
  }));
  const links = extractLinks(rawText);
  const preferred_roles = inferPreferredRoles(skills, experience, rawText);
  const preferred_locations = uniqueStrings([location]);
  const presentFields = [
    name,
    email,
    phone,
    location,
    summary,
    links.github_url,
    links.linkedin_url,
    links.portfolio_url,
  ].filter(Boolean).length;

  return {
    name,
    email,
    phone,
    location,
    summary,
    skills,
    experience,
    projects,
    education,
    certifications,
    github_url: links.github_url,
    linkedin_url: links.linkedin_url,
    portfolio_url: links.portfolio_url,
    preferred_roles,
    preferred_locations,
    salary_expectation: null,
    career_goal: null,
    communication_style: null,
    confidence_score: scoreToConfidence(presentFields + skills.length + projects.length, 16),
  };
}

function normalizeProjects(projects: unknown[], heuristics: ResumeStructuredData) {
  const heuristicByName = new Map(
    heuristics.projects
      .filter((project) => project.name)
      .map((project) => [project.name!.toLowerCase(), project]),
  );

  return (projects ?? [])
    .filter((project) => project && typeof project === "object")
    .map((project) => {
      const item = project as Record<string, unknown>;
      const name = firstNonEmpty(item.name as string, item.title as string);
      const fallback = name ? heuristicByName.get(name.toLowerCase()) : null;
      const description = firstNonEmpty(item.description as string, item.summary as string, fallback?.description);
      return {
        name: name ?? fallback?.name ?? "Project",
        description,
        github_url: firstNonEmpty(item.github_url as string, item.github as string, fallback?.github_url),
        live_url: firstNonEmpty(item.live_url as string, item.url as string, fallback?.live_url),
        tech_stack: uniqueStrings([
          ...(Array.isArray(item.tech_stack) ? (item.tech_stack as string[]) : []),
          ...(Array.isArray(item.technologies) ? (item.technologies as string[]) : []),
          ...(fallback?.tech_stack ?? []),
        ]),
        features: uniqueStrings([
          ...(Array.isArray(item.features) ? (item.features as string[]) : []),
          ...(fallback?.features ?? []),
        ]).slice(0, 8),
        summary: description,
      } satisfies ResumeProject;
    })
    .filter((project) => !!project.name);
}

function sanitizeParsedResume(parsed: Partial<ResumeStructuredData>, rawText: string): ResumeStructuredData {
  const heuristics = heuristicResumeParse(rawText);
  const skills = uniqueStrings([...(parsed.skills ?? []), ...heuristics.skills]);
  const experience = (parsed.experience ?? heuristics.experience)
    .filter(Boolean)
    .map((item) => ({
      company: firstNonEmpty(item.company, (item as any).employer),
      title: firstNonEmpty(item.title, (item as any).role),
      location: firstNonEmpty(item.location),
      start_date: firstNonEmpty(item.start_date),
      end_date: firstNonEmpty(item.end_date),
      is_current: typeof item.is_current === "boolean" ? item.is_current : item.is_current ?? null,
      description: firstNonEmpty(item.description, item.summary),
      summary: firstNonEmpty(item.summary, item.description),
    }));
  const projects = normalizeProjects(parsed.projects ?? heuristics.projects, heuristics);
  const education = (parsed.education ?? heuristics.education)
    .filter(Boolean)
    .map((item) => ({
      school: firstNonEmpty(item.school, (item as any).institution),
      degree: firstNonEmpty(item.degree),
      field: firstNonEmpty(item.field, (item as any).major),
      start_date: firstNonEmpty(item.start_date),
      end_date: firstNonEmpty(item.end_date, (item as any).year),
      description: firstNonEmpty(item.description, item.summary),
      summary: firstNonEmpty(item.summary, item.description),
    }));
  const certifications = (parsed.certifications ?? heuristics.certifications)
    .filter(Boolean)
    .map((item) => ({
      name: firstNonEmpty(item.name),
      issuer: firstNonEmpty(item.issuer),
      date: firstNonEmpty(item.date),
      summary: firstNonEmpty(item.summary),
    }));

  const links = {
    ...extractLinks(rawText),
    github_url: firstNonEmpty(parsed.github_url, heuristics.github_url),
    linkedin_url: firstNonEmpty(parsed.linkedin_url, heuristics.linkedin_url),
    portfolio_url: firstNonEmpty(parsed.portfolio_url, heuristics.portfolio_url),
  };

  const preferred_roles = uniqueStrings([
    ...(parsed.preferred_roles ?? []),
    ...heuristics.preferred_roles,
    ...inferPreferredRoles(skills, experience, rawText),
  ]).slice(0, 10);
  const preferred_locations = uniqueStrings([
    ...(parsed.preferred_locations ?? []),
    ...(heuristics.preferred_locations ?? []),
    parsed.location ?? "",
  ]);
  const confidenceSignals = [
    firstNonEmpty(parsed.name, heuristics.name),
    firstNonEmpty(parsed.email, heuristics.email),
    firstNonEmpty(parsed.phone, heuristics.phone),
    firstNonEmpty(parsed.location, heuristics.location),
    firstNonEmpty(parsed.summary, heuristics.summary),
    links.github_url,
    links.linkedin_url,
    links.portfolio_url,
  ].filter(Boolean).length;

  return {
    name: firstNonEmpty(parsed.name, heuristics.name),
    email: firstNonEmpty(parsed.email, heuristics.email),
    phone: firstNonEmpty(parsed.phone, heuristics.phone),
    location: firstNonEmpty(parsed.location, heuristics.location),
    summary: firstNonEmpty(parsed.summary, heuristics.summary),
    skills,
    experience,
    projects,
    education,
    certifications,
    github_url: links.github_url,
    linkedin_url: links.linkedin_url,
    portfolio_url: links.portfolio_url,
    preferred_roles,
    preferred_locations,
    salary_expectation:
      typeof parsed.salary_expectation === "number" ? parsed.salary_expectation : heuristics.salary_expectation,
    career_goal: firstNonEmpty(parsed.career_goal, heuristics.career_goal),
    communication_style: firstNonEmpty(parsed.communication_style, heuristics.communication_style),
    confidence_score:
      typeof parsed.confidence_score === "number"
        ? Math.max(0, Math.min(1, Number(parsed.confidence_score.toFixed(2))))
        : scoreToConfidence(confidenceSignals + skills.length + projects.length, 18),
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
    const result = await callOpenRouterJson<ResumeStructuredData>(
      [
        {
          role: "system",
          content:
            "Extract resume data into strict JSON. Populate contact details, summary, project URLs, project features, skills, work history, education, certifications, and likely preferred roles. Use empty arrays for missing lists, null for missing scalars, and a confidence_score from 0 to 1.",
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

    return {
      ...result,
      data: sanitizeParsedResume(result.data, rawText),
    };
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
