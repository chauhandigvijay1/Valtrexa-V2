import * as cheerio from "cheerio";
import { requireApiUser } from "./_lib/auth.js";
import {
  fallbackCompanyResearch,
  fallbackJobMatch,
  fallbackLoomScript,
  fallbackOutreach,
  fallbackResumeAnalysis,
  fallbackTailoredResume,
} from "./_lib/ai-fallbacks.js";
import {
  getLatestResumeParseCompat,
  insertDailySummaryCompat,
  insertResumeParseCompat,
  insertResumeVersionCompat,
  isMissingSchemaError,
  listWorkflowEventsCompat,
  normalizeResumeVersion,
} from "./_lib/compat.js";
import {
  getBaseUrl,
  json,
  methodNotAllowed,
  readJson,
  handleCorsPreflight,
  addCorsHeaders,
  safeErrorMessage,
} from "./_lib/http.js";
import {
  importAshby,
  importGreenhouse,
  importHtmlSource,
  importLever,
  type ImportedJob,
} from "./_lib/job-sources.js";
import { buildJobMetadata } from "./_lib/workers/job-metadata.js";
import { getProvider } from "./_lib/providers.js";
import { callOpenRouterJson, callOpenRouterText } from "./_lib/openrouter.js";
import {
  extractResumeText,
  parseResumeText,
  type ResumeStructuredData,
} from "./_lib/resume-parser.js";
import { dedupeRoles, expandRoleVariants } from "./_lib/role-taxonomy.js";
import { syncResumeToBrain } from "./_lib/candidate-brain.js";
import { supabaseAdmin } from "./_lib/supabase.js";
import { emitWorkflowEvent } from "./_lib/workflow-events.js";
import { processTelegramUpdate } from "./_lib/telegram.js";
import { logger } from "./_lib/logger.js";
import { checkRateLimit, rateLimitKey } from "./_lib/rate-limiter.js";
import { initSentry } from "./_lib/sentry.js";
import { initTelegramBot } from "./_lib/telegram-init.js";

import {
  checkProviderCookie,
  refreshProviderCookie,
  checkAllCookies,
  deleteProviderCookie,
  validateCookieValue,
  checkProviderCookieSync,
  getAllCookieStatuses,
  getLoginGuide,
} from "./_lib/cookie-manager.js";

type SourceRequest =
  | { source: "greenhouse"; boardToken: string }
  | { source: "lever"; site: string }
  | { source: "ashby"; boardUrl: string }
  | {
      source: "linkedin" | "naukri" | "wellfound";
      searchUrl: string;
      headers?: Record<string, string>;
    };

type ResumeProcessBody = {
  resumeId?: string;
  title: string;
  description?: string | null;
  isPrimary?: boolean;
  storagePath: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
};

type ResumeAnalysisBody = {
  resumeId: string;
  resumeVersionId?: string;
  jobId?: string;
  jobDescription: string;
};

type JobMatchBody = {
  jobId: string;
  resumeId: string;
  resumeVersionId?: string;
};

type CompanyResearchBody = {
  companyName: string;
  companyId?: string;
  website?: string;
};

type PainPointBody = {
  companyName: string;
  companyId?: string;
};

type PainPointSourceSeed = {
  title?: string | null;
  description?: string | null;
  source?: string | null;
};

type OutreachBody = {
  type: "cold_email" | "linkedin_message" | "recruiter_followup" | "hiring_manager_outreach";
  companyName: string;
  recruiterId?: string;
  resumeId: string;
  painPointIds?: string[];
};

type LoomBody = {
  companyName: string;
  recruiterId?: string;
  resumeId: string;
  painPointIds?: string[];
};

type OutreachCampaignBody = {
  companyName: string;
  recruiterId?: string;
  resumeId: string;
};

type Analysis = {
  atsScore: number;
  missingKeywords: string[];
  strengths: string[];
  weaknesses: string[];
  improvementSuggestions: string[];
};

type TailoredResume = {
  optimizedResume: string;
  atsFriendlyResume: string;
  missingSkills: string[];
};

type MatchResult = {
  score: number;
  skillsMatched: string[];
  skillsMissing: string[];
  fitSummary: string;
  gapAnalysis: string;
};

type ResearchResult = {
  summary: string;
  products: string[];
  recentNews: string;
  hiringSignals: string[];
  techStack: string[];
  fundingData: Record<string, unknown>;
  engineeringCultureNotes: string;
};

type PainPointResult = {
  painPoints: Array<{
    title: string;
    category: string;
    description: string;
    evidence: string;
    severity: number;
    suggestedSolution: string;
    signalSource: string;
  }>;
};

type OutreachResult = {
  subject: string;
  body: string;
};

type LoomScript = {
  hook: string;
  problemStatement: string;
  solutionPitch: string;
  cta: string;
  fullScript: string;
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    atsScore: { type: "integer", minimum: 0, maximum: 100 },
    missingKeywords: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    improvementSuggestions: { type: "array", items: { type: "string" } },
  },
  required: ["atsScore", "missingKeywords", "strengths", "weaknesses", "improvementSuggestions"],
} as const;

const tailoredSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    optimizedResume: { type: "string" },
    atsFriendlyResume: { type: "string" },
    missingSkills: { type: "array", items: { type: "string" } },
  },
  required: ["optimizedResume", "atsFriendlyResume", "missingSkills"],
} as const;

const matchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    skillsMatched: { type: "array", items: { type: "string" } },
    skillsMissing: { type: "array", items: { type: "string" } },
    fitSummary: { type: "string" },
    gapAnalysis: { type: "string" },
  },
  required: ["score", "skillsMatched", "skillsMissing", "fitSummary", "gapAnalysis"],
} as const;

const researchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    products: { type: "array", items: { type: "string" } },
    recentNews: { type: "string" },
    hiringSignals: { type: "array", items: { type: "string" } },
    techStack: { type: "array", items: { type: "string" } },
    fundingData: { type: "object", additionalProperties: true },
    engineeringCultureNotes: { type: "string" },
  },
  required: [
    "summary",
    "products",
    "recentNews",
    "hiringSignals",
    "techStack",
    "fundingData",
    "engineeringCultureNotes",
  ],
} as const;

const painpointSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    painPoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          description: { type: "string" },
          evidence: { type: "string" },
          severity: { type: "integer", minimum: 1, maximum: 5 },
          suggestedSolution: { type: "string" },
          signalSource: { type: "string" },
        },
        required: [
          "title",
          "category",
          "description",
          "evidence",
          "severity",
          "suggestedSolution",
          "signalSource",
        ],
      },
    },
  },
  required: ["painPoints"],
} as const;

const outreachSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
} as const;

const loomSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hook: { type: "string" },
    problemStatement: { type: "string" },
    solutionPitch: { type: "string" },
    cta: { type: "string" },
    fullScript: { type: "string" },
  },
  required: ["hook", "problemStatement", "solutionPitch", "cta", "fullScript"],
} as const;

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

const CODE_NOISE_PATTERNS = [
  /document\.documentElement/i,
  /localStorage\.getItem/i,
  /classList\./i,
  /window\.matchMedia/i,
  /data-theme/i,
  /function\s+[a-zA-Z_$][\w$]*\s*\(/i,
  /=>/,
];

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function hasCodeNoise(value: string) {
  const normalized = normalizeWhitespace(stripHtml(value));
  if (!normalized) return false;
  const matchedSignals = CODE_NOISE_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  const symbolDensity =
    (normalized.match(/[{}()[\];]/g)?.length ?? 0) / Math.max(normalized.length, 1);
  return matchedSignals >= 2 || symbolDensity > 0.08;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(stripHtml(value ?? ""));
    if (!normalized || hasCodeNoise(normalized)) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function sanitizeNarrative(value: string, fallback = "", maxLength = 4000) {
  const candidates = [value, fallback];
  for (const candidate of candidates) {
    const units = stripHtml(candidate)
      .split(/(?<=[.!?])\s+|\n+/)
      .map((part) => normalizeWhitespace(part))
      .filter((part) => part.length > 8 && !hasCodeNoise(part));
    if (units.length) {
      return units.join(" ").slice(0, maxLength);
    }
  }
  return "";
}

function sanitizeListItems(values: string[], fallback: string[] = [], limit = 8) {
  const cleaned = uniqueStrings(values).slice(0, limit);
  return cleaned.length ? cleaned : uniqueStrings(fallback).slice(0, limit);
}

function sanitizeFundingData(value: unknown, fallback: Record<string, unknown>) {
  const record = asRecord(value);
  const entries = Object.entries(record).flatMap(([key, rawValue]) => {
    if (typeof rawValue === "string") {
      const cleaned = sanitizeNarrative(rawValue);
      return cleaned ? [[key, cleaned] as const] : [];
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean" || rawValue === null) {
      return [[key, rawValue] as const];
    }
    return [];
  });
  return entries.length ? Object.fromEntries(entries) : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeResearchPayload(
  value: unknown,
  input: {
    companyName: string;
    websiteText: string;
    techStack: string[];
    newsData: string;
    sourceUrls: string[];
  },
): ResearchResult {
  const fallback = fallbackCompanyResearch(input);
  const payload = asRecord(value);
  return {
    summary: sanitizeNarrative(asString(payload.summary), fallback.summary),
    products: sanitizeListItems(asStringArray(payload.products), fallback.products, 6),
    recentNews: sanitizeNarrative(
      asString(payload.recentNews ?? payload.recent_news),
      fallback.recentNews,
    ),
    hiringSignals: sanitizeListItems(
      asStringArray(payload.hiringSignals ?? payload.hiring_signals),
      fallback.hiringSignals,
      6,
    ),
    techStack: sanitizeListItems(
      asStringArray(payload.techStack ?? payload.tech_stack),
      fallback.techStack,
      10,
    ),
    fundingData: sanitizeFundingData(
      payload.fundingData ?? payload.funding_data,
      fallback.fundingData,
    ),
    engineeringCultureNotes: sanitizeNarrative(
      asString(payload.engineeringCultureNotes ?? payload.engineering_culture_notes),
      fallback.engineeringCultureNotes,
    ),
  };
}

function normalizeTailoredResumePayload(
  value: unknown,
  resumeText: string,
  jobDescription: string,
): TailoredResume {
  const payload = asRecord(value);
  const optimizedResume = asString(payload.optimizedResume ?? payload.optimized_resume);
  const atsFriendlyResume = asString(payload.atsFriendlyResume ?? payload.ats_friendly_resume);
  const missingSkills = asStringArray(payload.missingSkills ?? payload.missing_skills);

  if (optimizedResume && atsFriendlyResume) {
    return { optimizedResume, atsFriendlyResume, missingSkills };
  }

  return fallbackTailoredResume(resumeText, jobDescription);
}

function normalizeMatchPayload(
  value: unknown,
  companyName: string,
  resumeText: string,
  jobDescription: string,
): MatchResult {
  const fallback = fallbackJobMatch(companyName, resumeText, jobDescription);
  const payload = asRecord(value);
  const fitSummary = asString(payload.fitSummary ?? payload.fit_summary);
  const gapAnalysis = asString(payload.gapAnalysis ?? payload.gap_analysis);
  const skillsMatched = asStringArray(payload.skillsMatched ?? payload.skills_matched);
  const skillsMissing = asStringArray(payload.skillsMissing ?? payload.skills_missing);
  const score = clampInteger(payload.score, 0, 100, fallback.score);

  if (!fitSummary || !gapAnalysis) {
    return fallback;
  }

  return {
    score,
    skillsMatched,
    skillsMissing,
    fitSummary,
    gapAnalysis,
  };
}

function normalizePainPointPayload(
  value: unknown,
  companyName: string,
  research: Record<string, unknown> | null,
  jobs: PainPointSourceSeed[],
): PainPointResult {
  const payload = asRecord(value);
  const painPoints = Array.isArray(payload.painPoints) ? payload.painPoints : null;
  if (!painPoints?.length) return { painPoints: [] };

  const normalized = painPoints
    .map((item) => {
      const point = asRecord(item);
      const title = sanitizeNarrative(asString(point.title), "", 180);
      const category = asString(point.category, "general");
      const description = sanitizeNarrative(asString(point.description));
      const evidence = sanitizeNarrative(asString(point.evidence));
      const suggestedSolution = sanitizeNarrative(
        asString(point.suggestedSolution ?? point.suggested_solution),
      );
      const signalSource = sanitizeNarrative(
        asString(point.signalSource ?? point.signal_source, "company evidence"),
        "company evidence",
        220,
      );
      if (!title || !description || !evidence || !suggestedSolution) return null;
      return {
        title,
        category,
        description,
        evidence,
        severity: clampInteger(point.severity, 1, 5, 3),
        suggestedSolution,
        signalSource,
      };
    })
    .filter((item): item is PainPointResult["painPoints"][number] => !!item);

  return normalized.length ? { painPoints: normalized } : { painPoints: [] };
}

function normalizeLoomPayload(
  value: unknown,
  input: {
    companyName: string;
    recruiter?: Record<string, any> | null;
    resume: ResumeStructuredData | Record<string, any>;
    painPoints: Array<Record<string, any>>;
  },
): LoomScript {
  const fallback = fallbackLoomScript(input);
  const payload = asRecord(value);
  const hook = asString(payload.hook);
  const problemStatement = asString(payload.problemStatement ?? payload.problem_statement);
  const solutionPitch = asString(payload.solutionPitch ?? payload.solution_pitch);
  const cta = asString(payload.cta);
  const fullScript = asString(payload.fullScript ?? payload.full_script);

  if (!hook || !problemStatement || !solutionPitch || !cta || !fullScript) {
    return fallback;
  }

  return { hook, problemStatement, solutionPitch, cta, fullScript };
}

function encodeResearchIntelligence(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function decodeResearchIntelligence(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asRecord(JSON.parse(value));
  } catch (err) {
    logger.warn("[...route] decodeResearchIntelligence JSON parse failed", err);
    return {};
  }
}

type StoredPainPoint = {
  id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  source_url: string | null;
  severity: number;
  tags: string[] | null;
  category: string;
  evidence: string;
  suggested_solution: string;
  signal_source: string;
};

async function generatePainPointsForCompany(userId: string, body: PainPointBody) {
  const [researchResult, jobsResult] = await Promise.all([
    supabaseAdmin
      .from("company_research")
      .select("*")
      .eq("user_id", userId)
      .eq("company_name", body.companyName)
      .maybeSingle(),
    supabaseAdmin
      .from("jobs")
      .select("title,description,source")
      .eq("user_id", userId)
      .eq("company_name", body.companyName)
      .limit(10),
  ]);

  const researchMetadata = decodeResearchIntelligence(researchResult.data?.file_url);
  const researchText = researchResult.data
    ? JSON.stringify({
        summary: researchResult.data.summary,
        recentNews: researchResult.data.recent_news,
        hiringSignals: asStringArray(researchMetadata.hiringSignals),
        techStack: researchResult.data.tech_stack,
        products: asStringArray(researchMetadata.products),
        engineeringCultureNotes: asString(researchMetadata.engineeringCultureNotes),
      })
    : "";

  const jobsText = JSON.stringify(jobsResult.data ?? []);
  const result = await withTimeout(
    callOpenRouterJson<PainPointResult>(
      [
        {
          role: "system",
          content:
            "Infer hiring pain points from evidence only. Use job descriptions, company research, and public-company context already provided. Return strict JSON.",
        },
        {
          role: "user",
          content: `Company: ${body.companyName}\nResearch: ${researchText}\nJobs: ${jobsText}`,
        },
      ],
      "painpoints",
      painpointSchema,
      { userId },
    ),
    35000,
    "Pain-point generation",
  ).catch(() => ({
    data: { painPoints: [] },
    model: "local-fallback:painpoints",
    usage: null,
    source: "env" as const,
  }));
  const normalizedPainPoints = normalizePainPointPayload(
    result.data,
    body.companyName,
    (researchResult.data as Record<string, unknown> | null) ?? null,
    (jobsResult.data ?? []) as PainPointSourceSeed[],
  );

  const inserted: StoredPainPoint[] = [];
  for (const point of normalizedPainPoints.painPoints) {
    const payload = {
      user_id: userId,
      company_id: body.companyId ?? null,
      company_name: body.companyName,
      title: point.title,
      description: `${point.description}\n\nEvidence: ${point.evidence}\n\nSuggested solution: ${point.suggestedSolution}`,
      source_url: point.signalSource.startsWith("http") ? point.signalSource : null,
      severity: point.severity,
      tags: [point.category, point.signalSource].filter(Boolean),
    } as any;

    const existing = await supabaseAdmin
      .from("painpoints")
      .select("id")
      .eq("user_id", userId)
      .eq("company_name", body.companyName)
      .eq("title", point.title)
      .maybeSingle();

    const mutation = existing.data?.id
      ? await supabaseAdmin
          .from("painpoints")
          .update(payload)
          .eq("id", existing.data.id)
          .eq("user_id", userId)
          .select("*")
          .single()
      : await supabaseAdmin.from("painpoints").insert(payload).select("*").single();

    if (mutation.error || !mutation.data) {
      throw new Error(mutation.error?.message ?? "Failed to save pain points.");
    }

    inserted.push({
      ...mutation.data,
      category: point.category,
      evidence: point.evidence,
      suggested_solution: point.suggestedSolution,
      signal_source: point.signalSource,
    });
  }

  if (inserted.length) {
    await emitWorkflowEvent({
      userId,
      eventType: "painpoints_generated",
      entityType: "painpoints",
      payload: { companyName: body.companyName, painPointIds: inserted.map((item) => item.id) },
    });
  }

  return inserted;
}

async function resolveSourceJobs(source: SourceRequest): Promise<ImportedJob[]> {
  const provider = getProvider(source.source);
  const result = await provider.importJobs(source);
  if (result.status === "READY_FOR_CREDENTIALS") {
    logger.info(`Provider ${source.source} is READY_FOR_CREDENTIALS`);
  }
  return result.jobs;
}

async function fetchWebsiteSummary(website?: string) {
  if (!website) return { text: "", techStack: [] as string[], sourceUrls: [] as string[] };
  let response: Response;
  try {
    response = await fetch(website, {
      headers: { "user-agent": "VALTREXA-V2/1.0" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    logger.warn("[...route] fetchWebsiteSummary fetch failed", err);
    return { text: "", techStack: [] as string[], sourceUrls: [website] };
  }
  if (!response.ok) return { text: "", techStack: [] as string[], sourceUrls: [website] };
  const html = await response.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, template, svg").remove();
  const prioritizedBlocks = [
    $('meta[name="description"]').attr("content") ?? "",
    $('meta[property="og:description"]').attr("content") ?? "",
    $("main h1, article h1, [role='main'] h1, h1").first().text(),
    ...$("main p, article p, [role='main'] p, main li, article li, [role='main'] li")
      .map((_, element) => $(element).text())
      .get(),
  ];
  const text =
    uniqueStrings(prioritizedBlocks).join(" ").slice(0, 12000) ||
    sanitizeNarrative($("body").text(), "", 12000);
  const scripts = $("script[src]")
    .map((_, el) => $(el).attr("src") ?? "")
    .get()
    .join(" ");
  const techStack = [
    "react",
    "next",
    "vite",
    "segment",
    "stripe",
    "tailwind",
    "sentry",
    "apollo",
    "graphql",
    "shopify",
  ].filter((name) => scripts.toLowerCase().includes(name));
  return { text, techStack, sourceUrls: [website] };
}

async function fetchNews(companyName: string) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(companyName)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "VALTREXA-V2/1.0" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    logger.warn("[...route] fetchNews fetch failed", err);
    return "";
  }
  if (!response.ok) return "";
  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = $("item")
    .slice(0, 5)
    .map((_, item) => {
      const title = sanitizeNarrative($(item).find("title").first().text(), "", 240);
      const source = sanitizeNarrative($(item).find("source").first().text(), "", 120);
      if (!title) return "";
      return source ? `${title} (${source})` : title;
    })
    .get()
    .filter(Boolean);
  return items.join("\n").slice(0, 4000);
}

function buildSummary(payload: {
  applications: number;
  interviews: number;
  offers: number;
  rejections: number;
  responseRate: number;
  interviewRate: number;
}) {
  return [
    `Applications: ${payload.applications}`,
    `Interviews: ${payload.interviews}`,
    `Offers: ${payload.offers}`,
    `Rejections: ${payload.rejections}`,
    `Response rate: ${payload.responseRate}%`,
    `Interview rate: ${payload.interviewRate}%`,
  ].join("\n");
}

async function handleResumeProcess(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<ResumeProcessBody>(request);

  if (body.isPrimary) {
    let clearPrimary = supabaseAdmin
      .from("resumes")
      .update({ is_primary: false })
      .eq("user_id", user.id);
    if (body.resumeId) {
      clearPrimary = clearPrimary.neq("id", body.resumeId);
    }
    const { error } = await clearPrimary;
    if (error) {
      return json({ error: safeErrorMessage(error) }, { status: 400 });
    }
  }

  const resumeResult = body.resumeId
    ? await supabaseAdmin
        .from("resumes")
        .update({
          title: body.title,
          description: body.description ?? null,
          is_primary: !!body.isPrimary,
        })
        .eq("id", body.resumeId)
        .eq("user_id", user.id)
        .select("*")
        .single()
    : await supabaseAdmin
        .from("resumes")
        .insert({
          user_id: user.id,
          title: body.title,
          description: body.description ?? null,
          is_primary: !!body.isPrimary,
        })
        .select("*")
        .single();

  if (resumeResult.error || !resumeResult.data) {
    return json(
      { error: resumeResult.error?.message ?? "Failed to save resume." },
      { status: 400 },
    );
  }

  const resume = resumeResult.data;
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("resumes")
    .download(body.storagePath);
  if (downloadError || !fileData) {
    return json(
      { error: downloadError?.message ?? "Failed to download uploaded resume." },
      { status: 400 },
    );
  }

  const rawText = await extractResumeText(body.fileName, await fileData.arrayBuffer());
  const parsed = await parseResumeText(rawText, user.id);

  const { data: latestVersion } = await supabaseAdmin
    .from("resume_versions")
    .select("version")
    .eq("resume_id", resume.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latestVersion?.version ?? 0) + 1;
  const versionInsert = await insertResumeVersionCompat({
    resumeId: resume.id,
    userId: user.id,
    version: versionNumber,
    storagePath: body.storagePath,
    fileName: body.fileName,
    fileType: body.fileType,
    fileSizeBytes: body.fileSizeBytes,
    rawText,
  });

  if (versionInsert.error || !versionInsert.data) {
    return json(
      { error: versionInsert.error?.message ?? "Failed to create resume version." },
      { status: 400 },
    );
  }

  const version = normalizeResumeVersion(versionInsert.data);
  const parseInsert = await insertResumeParseCompat({
    userId: user.id,
    resumeId: resume.id,
    resumeVersionId: version.id,
    rawText,
    parsed: parsed.data as unknown as Record<string, unknown>,
    model: parsed.model,
    usage: parsed.usage,
  });

  if (parseInsert.error) {
    return json({ error: safeErrorMessage(parseInsert.error) }, { status: 400 });
  }

  await syncResumeToBrain(user.id, parsed.data, rawText);

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "resume_uploaded",
    entityType: "resume_versions",
    entityId: version.id,
    payload: {
      resumeId: resume.id,
      resumeVersionId: version.id,
      title: resume.title,
      storagePath: body.storagePath,
    },
  });
  await emitWorkflowEvent({
    userId: user.id,
    eventType: "resume_parsed",
    entityType: "resume_parses",
    entityId: version.id,
    payload: {
      resumeId: resume.id,
      resumeVersionId: version.id,
      fullName: parsed.data.name ?? null,
    },
  });

  return json({
    resume,
    version,
    parse: parsed.data,
  });
}

async function getResumeVersion(userId: string, resumeId: string, resumeVersionId?: string) {
  const versionQuery = resumeVersionId
    ? supabaseAdmin
        .from("resume_versions")
        .select("*")
        .eq("id", resumeVersionId)
        .eq("user_id", userId)
        .single()
    : supabaseAdmin
        .from("resume_versions")
        .select("*")
        .eq("resume_id", resumeId)
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

  const versionResult = await versionQuery;
  if (versionResult.error || !versionResult.data) return null;
  return versionResult.data;
}

async function handleResumeAnalyze(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<ResumeAnalysisBody>(request);
  const versionData = await getResumeVersion(user.id, body.resumeId, body.resumeVersionId);

  if (!versionData) {
    return json({ error: "Resume version not found." }, { status: 404 });
  }

  const normalizedVersion = normalizeResumeVersion(versionData);
  const rawText = normalizedVersion.parsed_text || normalizedVersion.content;
  if (!rawText) {
    return json({ error: "Resume has not been parsed yet." }, { status: 400 });
  }

  const analysis = await withTimeout(
    callOpenRouterJson<Analysis>(
      [
        {
          role: "system",
          content:
            "You are an ATS resume auditor. Return strict JSON only. Missing keywords must be specific job-description terms absent or weak in the resume.",
        },
        {
          role: "user",
          content: `Resume:\n${rawText.slice(0, 60000)}\n\nJob Description:\n${body.jobDescription.slice(0, 30000)}`,
        },
      ],
      "resume_analysis",
      analysisSchema,
      { userId: user.id },
    ),
    45000,
    "ATS analysis",
  ).catch(() => ({
    data: fallbackResumeAnalysis(rawText, body.jobDescription),
    model: "local-fallback:resume-analysis",
    usage: null,
    source: "env" as const,
  }));

  const insertResult = await supabaseAdmin
    .from("resume_analyses")
    .insert({
      user_id: user.id,
      resume_id: body.resumeId,
      resume_version_id: versionData.id,
      job_id: body.jobId ?? null,
      job_description: body.jobDescription,
      ats_score: analysis.data.atsScore,
      missing_keywords: analysis.data.missingKeywords,
      strengths: analysis.data.strengths,
      weaknesses: analysis.data.weaknesses,
      improvement_suggestions: analysis.data.improvementSuggestions,
      analysis: analysis.data,
    })
    .select("*")
    .single();

  if (insertResult.error || !insertResult.data) {
    return json(
      { error: insertResult.error?.message ?? "Failed to store ATS analysis." },
      { status: 400 },
    );
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "ats_completed",
    entityType: "resume_analyses",
    entityId: insertResult.data.id,
    payload: {
      resumeId: body.resumeId,
      resumeVersionId: versionData.id,
      jobId: body.jobId ?? null,
      atsScore: analysis.data.atsScore,
    },
  });

  return json(insertResult.data);
}

async function handleResumeTailor(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<ResumeAnalysisBody>(request);
  const versionData = await getResumeVersion(user.id, body.resumeId, body.resumeVersionId);

  if (!versionData) {
    return json({ error: "Resume version not found." }, { status: 404 });
  }

  const normalizedVersion = normalizeResumeVersion(versionData);
  const sourceResume = normalizedVersion.parsed_text || normalizedVersion.content;
  if (!sourceResume) {
    return json({ error: "Resume content unavailable." }, { status: 400 });
  }

  const isLatex =
    normalizedVersion.file_type === "application/x-tex" ||
    normalizedVersion.file_name?.endsWith(".tex");
  const timestamp = Date.now();

  let storagePath = "";
  let finalAtsFriendly = "";
  let finalOptimized = "N/A";
  let finalMissingSkills: string[] = [];

  let pdfStoragePath: string | null = null;
  let pdfFileSize: number | null = null;
  let pdfPageCount: number | null = null;
  let pdfVerified = false;

  if (isLatex) {
    // 1. NATIVE LATEX WORKFLOW
    const { data: texFile, error: downloadError } = await supabaseAdmin.storage
      .from("resumes")
      .download(normalizedVersion.storage_path);
    if (downloadError || !texFile) {
      return json(
        { error: downloadError?.message ?? "Original .tex file not found in storage." },
        { status: 404 },
      );
    }
    const texContent = await texFile.text();

    const mutatedTexResult = await withTimeout(
      callOpenRouterText(
        [
          {
            role: "system",
            content:
              "You are a Native LaTeX Engine. Rewrite the provided LaTeX resume for the provided Job Description. Preserve ALL preamble, documentclass, packages, margins, spacing, styling, and section order exactly as provided. DO NOT use markdown. DO NOT invent experience. Return ONLY the raw complete mutated LaTeX document.",
          },
          {
            role: "user",
            content: `Job Description:\n${body.jobDescription.slice(0, 30000)}\n\nOriginal Resume:\n${texContent}`,
          },
        ],
        { userId: user.id },
      ),
      55000,
      "Tailored latex generation",
    ).catch(() => ({ content: texContent }));

    let mutatedTex = (mutatedTexResult as any).content || texContent;
    mutatedTex = mutatedTex.replace(/^```[a-z]*\n/gi, "").replace(/\n```$/g, "");

    const texPath = `${user.id}/${body.resumeId}/tailored-${timestamp}.tex`;
    const uploadTex = await supabaseAdmin.storage
      .from("tailored-resumes")
      .upload(texPath, Buffer.from(mutatedTex, "utf-8"), {
        contentType: "application/x-tex",
        upsert: false,
      });

    if (uploadTex.error) {
      return json({ error: safeErrorMessage(uploadTex.error) }, { status: 400 });
    }

    storagePath = texPath;
    finalAtsFriendly = mutatedTex;

    // 2. COMPILE TO PDF NATIVELY
    try {
      const compileUrl = new URL("https://latexonline.cc/compile");
      compileUrl.searchParams.set("text", mutatedTex);
      compileUrl.searchParams.set("command", "pdflatex");
      const compileRes = await fetch(compileUrl.toString(), { redirect: "follow" });
      if (compileRes.ok) {
        const pdfBuffer = await compileRes.arrayBuffer();
        const pdfPath = `${user.id}/${body.resumeId}/tailored-${timestamp}.pdf`;
        const uploadPdf = await supabaseAdmin.storage
          .from("tailored-resumes")
          .upload(pdfPath, Buffer.from(pdfBuffer), {
            contentType: "application/pdf",
            upsert: false,
          });
        if (!uploadPdf.error) {
          pdfStoragePath = pdfPath;
          pdfFileSize = pdfBuffer.byteLength;
          try {
            const { PDFParse } = await import("pdf-parse");
            const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
            const textResult = await parser.getText();
            pdfPageCount = textResult.pages.length;
            pdfVerified = true;
          } catch (parseErr) {
            logger.error("pdf-parse failed:", parseErr);
          }
        }
      } else {
        logger.error("PDF Compilation failed", compileRes.status, await compileRes.text());
      }
    } catch (e) {
      logger.error("PDF Compilation error", e);
    }
  } else {
    // 3. LEGACY MARKDOWN WORKFLOW
    const tailored = await withTimeout(
      callOpenRouterJson<TailoredResume>(
        [
          {
            role: "system",
            content:
              "Rewrite the provided resume for the job description. Preserve truthfulness. Do not invent experience. Return strict JSON only.",
          },
          {
            role: "user",
            content: `Resume:\n${sourceResume.slice(0, 60000)}\n\nJob Description:\n${body.jobDescription.slice(0, 30000)}`,
          },
        ],
        "tailored_resume",
        tailoredSchema,
        { userId: user.id },
      ),
      45000,
      "Tailored resume generation",
    ).catch(() => ({
      data: fallbackTailoredResume(sourceResume, body.jobDescription),
      model: "local-fallback:tailored-resume",
      usage: null,
      source: "env" as const,
    }));
    const normalizedTailored = normalizeTailoredResumePayload(
      tailored.data,
      sourceResume,
      body.jobDescription,
    );

    finalOptimized = normalizedTailored.optimizedResume;
    finalAtsFriendly = normalizedTailored.atsFriendlyResume;
    finalMissingSkills = normalizedTailored.missingSkills;

    storagePath = `${user.id}/${body.resumeId}/tailored-${timestamp}.md`;
    const uploadMd = await supabaseAdmin.storage
      .from("tailored-resumes")
      .upload(storagePath, Buffer.from(finalAtsFriendly, "utf-8"), {
        contentType: "text/markdown; charset=utf-8",
        upsert: false,
      });

    if (uploadMd.error) {
      return json({ error: safeErrorMessage(uploadMd.error) }, { status: 400 });
    }
  }

  const insert = await supabaseAdmin
    .from("tailored_resumes")
    .insert({
      user_id: user.id,
      resume_id: body.resumeId,
      resume_version_id: versionData.id,
      job_id: body.jobId ?? null,
      job_description: body.jobDescription,
      optimized_resume: finalOptimized,
      ats_friendly_resume: finalAtsFriendly,
      missing_skills: finalMissingSkills,
      storage_path: storagePath,
      pdf_storage_path: pdfStoragePath,
      pdf_file_size: pdfFileSize,
      pdf_page_count: pdfPageCount,
      pdf_verified: pdfVerified,
    })
    .select("*")
    .single();

  if (insert.error || !insert.data) {
    return json(
      { error: insert.error?.message ?? "Failed to store tailored resume." },
      { status: 400 },
    );
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "resume_tailored",
    entityType: "tailored_resumes",
    entityId: insert.data.id,
    payload: {
      resumeId: body.resumeId,
      resumeVersionId: versionData.id,
      jobId: body.jobId ?? null,
      storagePath,
    },
  });

  return json(insert.data);
}

async function handleResumeDetails(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const url = new URL(request.url);
  const resumeId = url.searchParams.get("resumeId");

  if (!resumeId) {
    return json({ error: "resumeId is required." }, { status: 400 });
  }

  const versionsResult = await supabaseAdmin
    .from("resume_versions")
    .select("*")
    .eq("user_id", user.id)
    .eq("resume_id", resumeId)
    .order("version", { ascending: false });

  if (versionsResult.error) {
    return json({ error: safeErrorMessage(versionsResult.error) }, { status: 400 });
  }

  const versions = (versionsResult.data ?? []).map(normalizeResumeVersion);
  const versionIds = versions.map((item) => item.id);
  const parse = await getLatestResumeParseCompat(user.id, resumeId);

  let analyses: any[] = [];
  let tailored: any[] = [];

  const analysesDirect = await supabaseAdmin
    .from("resume_analyses")
    .select("*")
    .eq("user_id", user.id)
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!analysesDirect.error) {
    analyses = analysesDirect.data ?? [];
  }

  const tailoredDirect = await supabaseAdmin
    .from("tailored_resumes")
    .select("*")
    .eq("user_id", user.id)
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!tailoredDirect.error) {
    tailored = tailoredDirect.data ?? [];
  }

  return json({
    versions,
    parse,
    analyses,
    tailored,
  });
}

async function handleResumeCenter(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);

  const resumesResult = await supabaseAdmin
    .from("resumes")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (resumesResult.error) {
    return json({ error: safeErrorMessage(resumesResult.error) }, { status: 400 });
  }

  const rows = [];
  for (const resume of resumesResult.data ?? []) {
    const detailsResult = await handleResumeDetails(
      new Request(`${getBaseUrl(request)}/api/resumes/details?resumeId=${resume.id}`, {
        method: "GET",
        headers: request.headers,
      }),
    );
    if (!detailsResult.ok) continue;
    const details = await detailsResult.json();
    const latestVersion = details.versions?.[0] ?? null;
    const latestAnalysis = details.analyses?.[0] ?? null;
    const latestTailored = details.tailored?.[0] ?? null;
    rows.push({
      ...resume,
      latestVersion,
      latestAnalysis,
      latestTailored,
      parse: details.parse ?? null,
      processing_state: latestVersion?.parse_status ?? "pending",
    });
  }

  return json({ rows });
}

async function handleResumeParse(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ resumeId: string; resumeVersionId?: string }>(request);
  const versionData = await getResumeVersion(user.id, body.resumeId, body.resumeVersionId);

  if (!versionData) {
    return json({ error: "Resume version not found." }, { status: 404 });
  }

  const normalizedVersion = normalizeResumeVersion(versionData);
  let rawText = normalizedVersion.parsed_text || normalizedVersion.content || "";

  if (!rawText && normalizedVersion.storage_path) {
    const downloaded = await supabaseAdmin.storage
      .from("resumes")
      .download(normalizedVersion.storage_path);
    if (downloaded.error || !downloaded.data) {
      return json(
        { error: downloaded.error?.message ?? "Failed to download resume version." },
        { status: 400 },
      );
    }
    rawText = await extractResumeText(
      normalizedVersion.file_name ?? "resume.tex",
      await downloaded.data.arrayBuffer(),
    );
  }

  if (!rawText) {
    return json({ error: "Resume content unavailable." }, { status: 400 });
  }

  const parsed = await parseResumeText(rawText, user.id);
  const parseInsert = await insertResumeParseCompat({
    userId: user.id,
    resumeId: body.resumeId,
    resumeVersionId: normalizedVersion.id,
    rawText,
    parsed: parsed.data as unknown as Record<string, unknown>,
    model: parsed.model,
    usage: parsed.usage,
  });

  if (parseInsert.error) {
    return json({ error: safeErrorMessage(parseInsert.error) }, { status: 400 });
  }

  await syncResumeToBrain(user.id, parsed.data, rawText);

  await supabaseAdmin
    .from("resume_versions")
    .update({ parsed_text: rawText, parse_status: "completed" } as any)
    .eq("id", normalizedVersion.id)
    .eq("user_id", user.id);
  await emitWorkflowEvent({
    userId: user.id,
    eventType: "resume_parsed",
    entityType: "resume_parses",
    entityId: normalizedVersion.id,
    payload: {
      resumeId: body.resumeId,
      resumeVersionId: normalizedVersion.id,
      fullName: parsed.data.name ?? null,
    },
  });

  return json({ resumeVersionId: normalizedVersion.id, parse: parsed.data });
}

async function handleResumePrimary(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ resumeId: string }>(request);

  await supabaseAdmin
    .from("resumes")
    .update({ is_primary: false })
    .eq("user_id", user.id)
    .neq("id", body.resumeId);
  const result = await supabaseAdmin
    .from("resumes")
    .update({ is_primary: true })
    .eq("user_id", user.id)
    .eq("id", body.resumeId)
    .select("*")
    .single();
  if (result.error || !result.data) {
    return json(
      { error: result.error?.message ?? "Failed to mark primary resume." },
      { status: 400 },
    );
  }
  return json(result.data);
}

async function handleResumeDelete(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ resumeId: string }>(request);

  const [versionsResult, tailoredResult] = await Promise.all([
    supabaseAdmin
      .from("resume_versions")
      .select("*")
      .eq("user_id", user.id)
      .eq("resume_id", body.resumeId),
    supabaseAdmin
      .from("tailored_resumes")
      .select("*")
      .eq("user_id", user.id)
      .eq("resume_id", body.resumeId),
  ]);

  const resumePaths = (versionsResult.data ?? [])
    .map((item: any) => normalizeResumeVersion(item).storage_path)
    .filter(Boolean);
  const tailoredPaths = (tailoredResult.data ?? [])
    .map((item: any) => item.storage_path)
    .filter(Boolean);
  if (resumePaths.length) await supabaseAdmin.storage.from("resumes").remove(resumePaths);
  if (tailoredPaths.length)
    await supabaseAdmin.storage.from("tailored-resumes").remove(tailoredPaths);

  const deleteResult = await supabaseAdmin
    .from("resumes")
    .delete()
    .eq("user_id", user.id)
    .eq("id", body.resumeId)
    .select("id")
    .maybeSingle();
  if (deleteResult.error) {
    return json({ error: safeErrorMessage(deleteResult.error) }, { status: 400 });
  }

  return json({ deleted: true, resumeId: body.resumeId });
}

async function handleJobsImport(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ sources: any[] }>(request).catch(() => null);
  if (!body || !Array.isArray(body.sources)) {
    return json({ error: "body.sources is required and must be an array." }, { status: 400 });
  }

  let importedCount = 0;
  const imported: any[] = [];

  for (const source of body.sources) {
    const integrationResult = await supabaseAdmin
      .from("integrations")
      .select("config,enabled")
      .eq("user_id", user.id)
      .eq("provider", source.source)
      .maybeSingle();

    const config = (integrationResult.data?.config ?? {}) as Record<string, string>;
    const hydratedSource =
      source.source === "greenhouse"
        ? {
            source: "greenhouse" as const,
            boardToken: source.boardToken || config.board_token || "",
          }
        : source.source === "lever"
          ? { source: "lever" as const, site: source.site || config.site || "" }
          : source.source === "ashby"
            ? { source: "ashby" as const, boardUrl: source.boardUrl || config.board_url || "" }
            : {
                source: source.source,
                searchUrl: source.searchUrl || config.search_url || "",
                headers: {
                  ...(source.headers ?? {}),
                  ...(config.session_cookie ? { cookie: config.session_cookie } : {}),
                  ...(config.cookie ? { cookie: config.cookie } : {}),
                },
              };

    const jobs = await resolveSourceJobs(hydratedSource as SourceRequest);
    for (const job of jobs) {
      const metadata = buildJobMetadata(job);
      const upsert = await supabaseAdmin
        .from("jobs")
        .upsert(
          {
            user_id: user.id,
            title: job.title,
            company_name: job.companyName,
            location: job.location,
            url: job.url,
            source: job.source,
            source_type: job.source,
            description: job.description,
            posted_at: job.postedAt,
            external_id: job.externalId,
            raw_payload: job.rawPayload,
            normalized_roles: metadata.normalized_roles,
            experience_level: metadata.experience_level,
            work_mode: metadata.work_mode,
            salary_min: metadata.salaryMin,
            salary_max: metadata.salaryMax,
            company_size: metadata.company_size,
            freshness_bucket: metadata.freshness_bucket,
            easy_apply: metadata.easy_apply,
            status: "open",
            priority: "medium",
          } as any,
          { onConflict: "user_id,source,external_id" },
        )
        .select("*");

      if (upsert.error && isMissingSchemaError(upsert.error)) {
        const fallback = await supabaseAdmin
          .from("jobs")
          .insert({
            user_id: user.id,
            title: job.title,
            company_name: job.companyName,
            location: job.location,
            url: job.url,
            source: job.source,
            description: job.description,
            normalized_roles: metadata.normalized_roles,
            experience_level: metadata.experience_level,
            work_mode: metadata.work_mode,
            salary_min: metadata.salaryMin,
            salary_max: metadata.salaryMax,
            company_size: metadata.company_size,
            freshness_bucket: metadata.freshness_bucket,
            easy_apply: metadata.easy_apply,
            status: "open",
            priority: "medium",
          } as any)
          .select("*");
        if (!fallback.error) {
          importedCount += fallback.data?.length ?? 0;
          imported.push(...(fallback.data ?? []));
        }
      } else if (!upsert.error) {
        importedCount += upsert.data?.length ?? 0;
        imported.push(...(upsert.data ?? []));
      }
    }

    const runInsert = await supabaseAdmin.from("job_import_runs").insert({
      user_id: user.id,
      source: source.source,
      finished_at: new Date().toISOString(),
      status: "completed",
      summary: {
        imported_count: jobs.length,
        source_request: hydratedSource,
      },
    } as any);
    if (runInsert.error) {
      return json({ error: safeErrorMessage(runInsert.error) }, { status: 400 });
    }

    await emitWorkflowEvent({
      userId: user.id,
      eventType: "jobs_imported",
      entityType: "job_import_runs",
      payload: {
        source: hydratedSource.source,
        importedCount: jobs.length,
        jobIds: imported.map((job) => job.id),
      },
    });
  }

  return json({ importedCount, jobs: imported });
}

async function handleJobsMatch(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<JobMatchBody>(request);

  const [jobResult, versionResult] = await Promise.all([
    supabaseAdmin.from("jobs").select("*").eq("id", body.jobId).eq("user_id", user.id).single(),
    body.resumeVersionId
      ? supabaseAdmin
          .from("resume_versions")
          .select("*")
          .eq("id", body.resumeVersionId)
          .eq("user_id", user.id)
          .single()
      : supabaseAdmin
          .from("resume_versions")
          .select("*")
          .eq("resume_id", body.resumeId)
          .eq("user_id", user.id)
          .order("version", { ascending: false })
          .limit(1)
          .single(),
  ]);

  if (jobResult.error || !jobResult.data) return json({ error: "Job not found." }, { status: 404 });
  if (versionResult.error || !versionResult.data)
    return json({ error: "Resume version not found." }, { status: 404 });

  const normalizedVersion = normalizeResumeVersion(versionResult.data);
  const resumeText = normalizedVersion.parsed_text || normalizedVersion.content;
  if (!resumeText || !jobResult.data.description) {
    return json({ error: "Resume or job description missing." }, { status: 400 });
  }

  const match = await withTimeout(
    callOpenRouterJson<MatchResult>(
      [
        {
          role: "system",
          content: "Score candidate-job fit and return strict JSON. Keep the score defensible.",
        },
        {
          role: "user",
          content: `Resume:\n${resumeText.slice(0, 60000)}\n\nJob Description:\n${jobResult.data.description.slice(0, 30000)}`,
        },
      ],
      "job_match",
      matchSchema,
      { userId: user.id },
    ),
    45000,
    "Job matching",
  ).catch(() => ({
    data: fallbackJobMatch(
      jobResult.data.company_name ?? "the team",
      resumeText,
      jobResult.data.description,
    ),
    model: "local-fallback:job-match",
    usage: null,
    source: "env" as const,
  }));
  const normalizedMatch = normalizeMatchPayload(
    match.data,
    jobResult.data.company_name ?? "the team",
    resumeText,
    jobResult.data.description,
  );

  const insert = await supabaseAdmin
    .from("job_matches")
    .insert({
      user_id: user.id,
      job_id: body.jobId,
      score: normalizedMatch.score,
      reasons: normalizedMatch.fitSummary,
      skills_matched: normalizedMatch.skillsMatched,
      skills_missing: normalizedMatch.skillsMissing,
      recommended_resume_id: body.resumeId,
      fit_summary: normalizedMatch.fitSummary,
      gap_analysis: normalizedMatch.gapAnalysis,
      job_snapshot: jobResult.data,
    } as any)
    .select("*")
    .single();

  if (insert.error && isMissingSchemaError(insert.error)) {
    const fallback = await supabaseAdmin
      .from("job_matches")
      .insert({
        user_id: user.id,
        job_id: body.jobId,
        score: normalizedMatch.score,
        reasons: `${normalizedMatch.fitSummary}\n\nGap analysis:\n${normalizedMatch.gapAnalysis}`,
        skills_matched: normalizedMatch.skillsMatched,
        skills_missing: normalizedMatch.skillsMissing,
        recommended_resume_id: body.resumeId,
      })
      .select("*")
      .single();
    if (fallback.error || !fallback.data) {
      return json(
        { error: fallback.error?.message ?? "Failed to save job match." },
        { status: 400 },
      );
    }
    await emitWorkflowEvent({
      userId: user.id,
      eventType: "jobs_matched",
      entityType: "job_matches",
      entityId: fallback.data.id,
      payload: { jobId: body.jobId, resumeId: body.resumeId, score: normalizedMatch.score },
    });
    return json(fallback.data);
  }

  if (insert.error || !insert.data) {
    return json({ error: safeErrorMessage(insert.error) }, { status: 400 });
  }

  await supabaseAdmin
    .from("jobs")
    .update({ match_score: normalizedMatch.score })
    .eq("id", body.jobId)
    .eq("user_id", user.id);
  await emitWorkflowEvent({
    userId: user.id,
    eventType: "jobs_matched",
    entityType: "job_matches",
    entityId: insert.data.id,
    payload: { jobId: body.jobId, resumeId: body.resumeId, score: normalizedMatch.score },
  });
  return json(insert.data);
}

async function verifyHighValueTarget(userId: string, companyName: string) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("target_value")
    .eq("user_id", userId)
    .ilike("name", companyName)
    .maybeSingle();
  if (error || !data || data.target_value !== "high") {
    throw new Response(
      JSON.stringify({
        error: `Strategic action gated. "${companyName}" is not classified as a High Value Target. Please mark this company as a High Value Target to unlock research, pain points, and campaigns.`,
      }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }
}

async function handleCompanyResearch(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<CompanyResearchBody>(request);
  await verifyHighValueTarget(user.id, body.companyName);
  const websiteData = await fetchWebsiteSummary(body.website);
  const newsData = await fetchNews(body.companyName);

  const research = await withTimeout(
    callOpenRouterJson<ResearchResult>(
      [
        {
          role: "system",
          content:
            'Create company research from the provided website and news evidence only. If funding is not visible, return {"status":"unknown"}.',
        },
        {
          role: "user",
          content: `Company: ${body.companyName}\nWebsite content:\n${websiteData.text}\n\nDetected tech hints: ${websiteData.techStack.join(", ")}\n\nNews feed excerpt:\n${newsData}`,
        },
      ],
      "company_research",
      researchSchema,
      { userId: user.id },
    ),
    35000,
    "Company research generation",
  ).catch(() => ({
    data: fallbackCompanyResearch({
      companyName: body.companyName,
      websiteText: websiteData.text,
      techStack: websiteData.techStack,
      newsData,
      sourceUrls: websiteData.sourceUrls,
    }),
    model: "local-fallback:company-research",
    usage: null,
    source: "env" as const,
  }));
  const normalizedResearch = normalizeResearchPayload(research.data, {
    companyName: body.companyName,
    websiteText: websiteData.text,
    techStack: websiteData.techStack,
    newsData,
    sourceUrls: websiteData.sourceUrls,
  });

  const basePayload = {
    user_id: user.id,
    company_id: body.companyId ?? null,
    company_name: body.companyName,
    summary: normalizedResearch.summary,
    recent_news: normalizedResearch.recentNews,
    tech_stack: Array.from(new Set([...normalizedResearch.techStack, ...websiteData.techStack])),
    culture_notes: [
      normalizedResearch.engineeringCultureNotes,
      normalizedResearch.products.length
        ? `Products: ${normalizedResearch.products.join(", ")}`
        : "",
      normalizedResearch.hiringSignals.length
        ? `Hiring signals: ${normalizedResearch.hiringSignals.join("; ")}`
        : "",
      `Funding: ${JSON.stringify(normalizedResearch.fundingData)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    source_urls: websiteData.sourceUrls,
    file_url: encodeResearchIntelligence({
      products: normalizedResearch.products,
      hiringSignals: normalizedResearch.hiringSignals,
      fundingData: normalizedResearch.fundingData,
      engineeringCultureNotes: normalizedResearch.engineeringCultureNotes,
    }),
  } as any;

  const existing = await supabaseAdmin
    .from("company_research")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_name", body.companyName)
    .maybeSingle();

  const upsert = existing.data?.id
    ? await supabaseAdmin
        .from("company_research")
        .update(basePayload)
        .eq("id", existing.data.id)
        .eq("user_id", user.id)
        .select("*")
        .single()
    : await supabaseAdmin.from("company_research").insert(basePayload).select("*").single();

  if (upsert.error || !upsert.data) {
    return json(
      { error: upsert.error?.message ?? "Failed to save company research." },
      { status: 400 },
    );
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "company_research_generated",
    entityType: "company_research",
    entityId: upsert.data.id,
    payload: { companyName: body.companyName, sourceUrls: websiteData.sourceUrls },
  });

  const generatedPainPoints = await generatePainPointsForCompany(user.id, {
    companyName: body.companyName,
    companyId: body.companyId,
  });

  return json({
    ...upsert.data,
    products: normalizedResearch.products,
    hiring_signals: normalizedResearch.hiringSignals,
    engineering_culture_notes: normalizedResearch.engineeringCultureNotes,
    funding_data: normalizedResearch.fundingData,
    painPoints: generatedPainPoints,
  });
}

async function handlePainPoints(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<PainPointBody>(request);
  await verifyHighValueTarget(user.id, body.companyName);
  try {
    const inserted = await generatePainPointsForCompany(user.id, body);
    return json({ painPoints: inserted });
  } catch (error) {
    return json({ error: safeErrorMessage(error) }, { status: 400 });
  }
}

async function handleOutreach(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<OutreachBody>(request);
  await verifyHighValueTarget(user.id, body.companyName);

  const [resumeParse, painPoints, recruiter] = await Promise.all([
    getLatestResumeParseCompat(user.id, body.resumeId),
    body.painPointIds?.length
      ? supabaseAdmin
          .from("painpoints")
          .select("*")
          .eq("user_id", user.id)
          .in("id", body.painPointIds)
      : supabaseAdmin
          .from("painpoints")
          .select("*")
          .eq("user_id", user.id)
          .eq("company_name", body.companyName)
          .limit(5),
    body.recruiterId
      ? supabaseAdmin
          .from("recruiters")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", body.recruiterId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!resumeParse) return json({ error: "Resume parse not found." }, { status: 404 });

  const result = await withTimeout(
    callOpenRouterJson<OutreachResult>(
      [
        {
          role: "system",
          content:
            "Write concise outreach grounded in the candidate profile and company pain points. Avoid generic fluff. Return strict JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            type: body.type,
            companyName: body.companyName,
            recruiter: recruiter.data,
            resume: resumeParse.parsed_data,
            painPoints: painPoints.data ?? [],
          }),
        },
      ],
      "outreach_message",
      outreachSchema,
      { userId: user.id },
    ),
    45000,
    "Outreach generation",
  ).catch(() => ({
    data: fallbackOutreach({
      type: body.type,
      companyName: body.companyName,
      recruiter: recruiter.data,
      resume: resumeParse.parsed_data,
      painPoints: painPoints.data ?? [],
    }),
    model: "local-fallback:outreach",
    usage: null,
    source: "env" as const,
  }));

  const insert = await supabaseAdmin
    .from("outreach_messages")
    .insert({
      user_id: user.id,
      recruiter_id: body.recruiterId ?? null,
      subject: result.data.subject,
      body: result.data.body,
      status: "draft",
    } as any)
    .select("*")
    .single();

  if (insert.error || !insert.data) {
    return json(
      { error: insert.error?.message ?? "Failed to save outreach message." },
      { status: 400 },
    );
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "outreach_generated",
    entityType: "outreach_messages",
    entityId: insert.data.id,
    payload: {
      companyName: body.companyName,
      kind: body.type,
      recruiterId: body.recruiterId ?? null,
    },
  });

  return json({
    ...insert.data,
    kind: body.type,
    company_name: body.companyName,
    pain_points: (painPoints.data ?? []).map((item: any) => item.title),
  });
}

async function handleOutreachCampaign(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<OutreachCampaignBody>(request);
  await verifyHighValueTarget(user.id, body.companyName);

  let availablePainPoints = await supabaseAdmin
    .from("painpoints")
    .select("*")
    .eq("user_id", user.id)
    .eq("company_name", body.companyName)
    .order("created_at", { ascending: false });

  if (availablePainPoints.error) {
    return json({ error: safeErrorMessage(availablePainPoints.error) }, { status: 400 });
  }

  if (!(availablePainPoints.data?.length ?? 0)) {
    await generatePainPointsForCompany(user.id, { companyName: body.companyName });
    availablePainPoints = await supabaseAdmin
      .from("painpoints")
      .select("*")
      .eq("user_id", user.id)
      .eq("company_name", body.companyName)
      .order("created_at", { ascending: false });
    if (availablePainPoints.error) {
      return json({ error: safeErrorMessage(availablePainPoints.error) }, { status: 400 });
    }
  }

  const selectedRecruiterId =
    body.recruiterId ||
    (
      await supabaseAdmin
        .from("recruiters")
        .select("id")
        .eq("user_id", user.id)
        .eq("company", body.companyName)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.id ||
    null;

  const allCampaigns = await supabaseAdmin
    .from("outreach_campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (allCampaigns.error) {
    return json({ error: safeErrorMessage(allCampaigns.error) }, { status: 400 });
  }

  const existingCampaign =
    (allCampaigns.data ?? []).find((campaign) => {
      try {
        const parsed = campaign.template ? asRecord(JSON.parse(campaign.template)) : {};
        return asString(parsed.companyName) === body.companyName;
      } catch (err) {
        logger.warn("[...route] campaign template JSON parse failed", err);
        return false;
      }
    }) ?? null;

  const initialTemplate = {
    companyName: body.companyName,
    resumeId: body.resumeId,
    recruiterId: selectedRecruiterId,
    painPointIds: (availablePainPoints.data ?? []).map((item) => item.id),
    generatedKinds: ["cold_email", "linkedin_message"],
  };

  const campaignMutation = existingCampaign
    ? await supabaseAdmin
        .from("outreach_campaigns")
        .update({
          name: `${body.companyName} campaign`,
          description: (availablePainPoints.data ?? []).map((item) => item.title).join(" • "),
          template: JSON.stringify(initialTemplate),
          active: true,
        } as any)
        .eq("id", existingCampaign.id)
        .eq("user_id", user.id)
        .select("*")
        .single()
    : await supabaseAdmin
        .from("outreach_campaigns")
        .insert({
          user_id: user.id,
          name: `${body.companyName} campaign`,
          description: (availablePainPoints.data ?? []).map((item) => item.title).join(" • "),
          template: JSON.stringify(initialTemplate),
          active: true,
        } as any)
        .select("*")
        .single();

  if (campaignMutation.error || !campaignMutation.data) {
    return json(
      { error: campaignMutation.error?.message ?? "Failed to create campaign." },
      { status: 400 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const requestInit = (path: string, payload: unknown) =>
    new Request(`${getBaseUrl(request)}/api/${path}`, {
      method: "POST",
      headers: {
        authorization: authHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

  const emailResponse = await handleOutreach(
    requestInit("outreach/generate", {
      type: "cold_email",
      companyName: body.companyName,
      recruiterId: selectedRecruiterId ?? undefined,
      resumeId: body.resumeId,
      painPointIds: (availablePainPoints.data ?? []).map((item) => item.id),
    }),
  );
  if (!emailResponse.ok) return emailResponse;
  const emailDraft = await emailResponse.json();

  const dmResponse = await handleOutreach(
    requestInit("outreach/generate", {
      type: "linkedin_message",
      companyName: body.companyName,
      recruiterId: selectedRecruiterId ?? undefined,
      resumeId: body.resumeId,
      painPointIds: (availablePainPoints.data ?? []).map((item) => item.id),
    }),
  );
  if (!dmResponse.ok) return dmResponse;
  const dmDraft = await dmResponse.json();

  const loomResponse = await handleLoom(
    requestInit("loom/script", {
      companyName: body.companyName,
      recruiterId: selectedRecruiterId ?? undefined,
      resumeId: body.resumeId,
      painPointIds: (availablePainPoints.data ?? []).map((item) => item.id),
    }),
  );
  if (!loomResponse.ok) return loomResponse;
  const loomDraft = await loomResponse.json();

  const emailLink = await supabaseAdmin
    .from("outreach_messages")
    .update({ campaign_id: campaignMutation.data.id })
    .eq("id", emailDraft.id)
    .eq("user_id", user.id);
  if (emailLink.error) {
    return json({ error: safeErrorMessage(emailLink.error) }, { status: 400 });
  }

  const dmLink = await supabaseAdmin
    .from("outreach_messages")
    .update({ campaign_id: campaignMutation.data.id })
    .eq("id", dmDraft.id)
    .eq("user_id", user.id);
  if (dmLink.error) {
    return json({ error: safeErrorMessage(dmLink.error) }, { status: 400 });
  }

  const loomLink = await supabaseAdmin
    .from("loom_scripts" as any)
    .update({
      metadata: {
        ...(asRecord(loomDraft.metadata) ?? {}),
        campaign_id: campaignMutation.data.id,
      },
    })
    .eq("id", loomDraft.id)
    .eq("user_id", user.id);
  if (loomLink.error) {
    return json({ error: safeErrorMessage(loomLink.error) }, { status: 400 });
  }

  const finalTemplate = {
    ...initialTemplate,
    drafts: {
      cold_email: emailDraft.id,
      linkedin_message: dmDraft.id,
    },
    loomScriptId: loomDraft.id,
  };

  const finalizedCampaign = await supabaseAdmin
    .from("outreach_campaigns")
    .update({
      description: (availablePainPoints.data ?? []).map((item) => item.title).join(" • "),
      template: JSON.stringify(finalTemplate),
      active: true,
    } as any)
    .eq("id", campaignMutation.data.id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (finalizedCampaign.error || !finalizedCampaign.data) {
    return json(
      { error: finalizedCampaign.error?.message ?? "Failed to finalize campaign." },
      { status: 400 },
    );
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "campaign_generated",
    entityType: "outreach_campaigns",
    entityId: finalizedCampaign.data.id,
    payload: {
      companyName: body.companyName,
      recruiterId: selectedRecruiterId,
      resumeId: body.resumeId,
      painPointIds: (availablePainPoints.data ?? []).map((item) => item.id),
      outreachMessageIds: [emailDraft.id, dmDraft.id],
      loomScriptId: loomDraft.id,
    },
  });

  return json({
    campaign: finalizedCampaign.data,
    coldEmailId: emailDraft.id,
    linkedinMessageId: dmDraft.id,
    loomScriptId: loomDraft.id,
    companyName: body.companyName,
  });
}

async function handleLoom(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<LoomBody>(request);
  await verifyHighValueTarget(user.id, body.companyName);

  const [resumeParse, recruiter, painPoints] = await Promise.all([
    getLatestResumeParseCompat(user.id, body.resumeId),
    body.recruiterId
      ? supabaseAdmin
          .from("recruiters")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", body.recruiterId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    body.painPointIds?.length
      ? supabaseAdmin
          .from("painpoints")
          .select("*")
          .eq("user_id", user.id)
          .in("id", body.painPointIds)
      : supabaseAdmin
          .from("painpoints")
          .select("*")
          .eq("user_id", user.id)
          .eq("company_name", body.companyName)
          .limit(5),
  ]);

  if (!resumeParse) return json({ error: "Resume parse not found." }, { status: 404 });

  const result = await withTimeout(
    callOpenRouterJson<LoomScript>(
      [
        {
          role: "system",
          content:
            "Write a personalized short Loom script grounded in evidence. Return strict JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            companyName: body.companyName,
            recruiter: recruiter.data,
            resume: resumeParse.parsed_data,
            painPoints: painPoints.data ?? [],
          }),
        },
      ],
      "loom_script",
      loomSchema,
      { userId: user.id },
    ),
    45000,
    "Loom generation",
  ).catch(() => ({
    data: fallbackLoomScript({
      companyName: body.companyName,
      recruiter: recruiter.data,
      resume: resumeParse.parsed_data,
      painPoints: painPoints.data ?? [],
    }),
    model: "local-fallback:loom-script",
    usage: null,
    source: "env" as const,
  }));
  const normalizedLoom = normalizeLoomPayload(result.data, {
    companyName: body.companyName,
    recruiter: recruiter.data,
    resume: resumeParse.parsed_data,
    painPoints: (painPoints.data ?? []) as Array<Record<string, any>>,
  });

  const insert = await supabaseAdmin
    .from("loom_scripts" as any)
    .insert({
      user_id: user.id,
      company_name: body.companyName,
      resume_id: body.resumeId,
      script_text: normalizedLoom.fullScript,
      metadata: {
        recruiter_id: body.recruiterId ?? null,
        painpoint_ids: body.painPointIds ?? [],
        hook: normalizedLoom.hook,
        problem_statement: normalizedLoom.problemStatement,
        solution_pitch: normalizedLoom.solutionPitch,
        cta: normalizedLoom.cta,
      },
    })
    .select("*")
    .single();

  if (insert.error || !insert.data) {
    return json(
      { error: insert.error?.message ?? "Failed to persist Loom script." },
      { status: 400 },
    );
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "loom_generated",
    entityType: "loom_scripts",
    entityId: insert.data.id,
    payload: {
      companyName: body.companyName,
      recruiterId: body.recruiterId ?? null,
      resumeId: body.resumeId,
    },
  });

  return json({
    ...insert.data,
    fullScript: normalizedLoom.fullScript,
    hook: normalizedLoom.hook,
    problemStatement: normalizedLoom.problemStatement,
    solutionPitch: normalizedLoom.solutionPitch,
    cta: normalizedLoom.cta,
  });
}

async function getAnalyticsPayload(userId: string) {
  const [applications, interviews] = await Promise.all([
    supabaseAdmin.from("applications").select("id,status").eq("user_id", userId),
    supabaseAdmin.from("interviews").select("id,status").eq("user_id", userId),
  ]);

  const appRows = applications.data ?? [];
  const interviewRows = interviews.data ?? [];
  const total = appRows.length;
  const offers = appRows.filter(
    (row) => row.status === "offer" || row.status === "accepted",
  ).length;
  const rejections = appRows.filter((row) => row.status === "rejected").length;
  const responses = appRows.filter((row) => !["saved", "applied"].includes(row.status)).length;
  const interviewsCount = interviewRows.length;

  return {
    applications: total,
    interviews: interviewsCount,
    offers,
    rejections,
    responseRate: total ? Math.round((responses / total) * 100) : 0,
    interviewRate: total ? Math.round((interviewsCount / total) * 100) : 0,
  };
}

async function handleAnalyticsSummary(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const payload = await getAnalyticsPayload(user.id);
  const appResult = await supabaseAdmin
    .from("applications")
    .select("status")
    .eq("user_id", user.id);
  const appRows = appResult.data ?? [];
  return json({
    ...payload,
    conversionFunnel: {
      savedOrApplied: appRows.filter((row) => ["saved", "applied"].includes(row.status)).length,
      screening: appRows.filter((row) => row.status === "screening").length,
      interview: appRows.filter((row) => row.status === "interview").length,
      offer: payload.offers,
      rejected: payload.rejections,
    },
  });
}

async function handleAnalyticsDailySummary(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const payload = await getAnalyticsPayload(user.id);
  const upsert = await insertDailySummaryCompat({
    userId: user.id,
    summaryDate: new Date().toISOString().slice(0, 10),
    summaryText: buildSummary(payload),
    payload,
  });

  if (upsert.error || !upsert.data) {
    return json(
      { error: upsert.error?.message ?? "Failed to generate daily summary." },
      { status: 400 },
    );
  }

  return json(upsert.data);
}

async function handleCandidateBrain(request: Request) {
  const user = await requireApiUser(request);

  if (request.method === "GET") {
    const [profile, baseProfile, memory, skills, projects, education, experiences, certifications] =
      await Promise.all([
        supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabaseAdmin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabaseAdmin.from("candidate_memory").select("*").eq("user_id", user.id),
        supabaseAdmin.from("skills").select("*").eq("user_id", user.id),
        supabaseAdmin.from("projects").select("*").eq("user_id", user.id),
        supabaseAdmin.from("education").select("*").eq("user_id", user.id),
        supabaseAdmin.from("experiences").select("*").eq("user_id", user.id),
        supabaseAdmin.from("certifications").select("*").eq("user_id", user.id),
      ]);

    return json({
      profile: profile.data || {},
      baseProfile: baseProfile.data || {},
      memory: memory.data || [],
      skills: skills.data || [],
      projects: projects.data || [],
      education: education.data || [],
      experiences: experiences.data || [],
      certifications: certifications.data || [],
    });
  }

  if (request.method === "PUT" || request.method === "POST") {
    const body = await readJson<any>(request);

    // 1. Update candidate_profiles
    if (body.profile) {
      const mergedRoles = dedupeRoles(
        Array.isArray(body.profile.preferred_roles) ? body.profile.preferred_roles : [],
      );
      const profilePayload = {
        current_company: body.profile.current_company ?? null,
        current_title: body.profile.current_title ?? null,
        years_experience: body.profile.years_experience ?? null,
        open_to_work: body.profile.open_to_work ?? null,
        summary: body.profile.summary ?? null,
        preferred_roles: mergedRoles.length ? mergedRoles : null,
        preferred_locations: body.profile.preferred_locations ?? null,
        remote_preference: body.profile.remote_preference ?? null,
        salary_expectation: body.profile.salary_expectation ?? null,
        github_url: body.profile.github_url ?? null,
        linkedin_url: body.profile.linkedin_url ?? null,
        portfolio_url: body.profile.portfolio_url ?? null,
        career_goal: body.profile.career_goal ?? null,
        communication_style: body.profile.communication_style ?? null,
      };

      const existing = await supabaseAdmin
        .from("candidate_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing.data?.id) {
        await supabaseAdmin
          .from("candidate_profiles")
          .update(profilePayload)
          .eq("id", existing.data.id)
          .eq("user_id", user.id);
      } else {
        await supabaseAdmin
          .from("candidate_profiles")
          .insert({ ...profilePayload, user_id: user.id });
      }
    }

    // 2. Update base profile
    if (body.baseProfile) {
      const baseProfilePayload = {
        name: body.baseProfile.name ?? null,
        email: body.baseProfile.email ?? null,
        phone: body.baseProfile.phone ?? null,
        location: body.baseProfile.location ?? null,
      };
      const update = await supabaseAdmin
        .from("profiles")
        .update(baseProfilePayload as any)
        .eq("id", user.id);
      if (update.error && isMissingSchemaError(update.error)) {
        const { phone: _phone, ...fallbackBaseProfilePayload } = baseProfilePayload;
        await supabaseAdmin
          .from("profiles")
          .update(fallbackBaseProfilePayload as any)
          .eq("id", user.id);
      }
    }

    // 3. Update skills
    if (Array.isArray(body.skills)) {
      await supabaseAdmin.from("skills").delete().eq("user_id", user.id);
      for (const skill of body.skills) {
        if (skill && typeof skill === "object" && skill.name) {
          await supabaseAdmin.from("skills").insert({
            user_id: user.id,
            name: skill.name,
            level: skill.level || "intermediate",
            category: skill.category || null,
          });
        }
      }
    }

    // 4. Update education
    if (Array.isArray(body.education)) {
      await supabaseAdmin.from("education").delete().eq("user_id", user.id);
      for (const edu of body.education) {
        if (edu && typeof edu === "object") {
          await supabaseAdmin.from("education").insert({
            user_id: user.id,
            school: edu.school || "Unknown School",
            degree: edu.degree || null,
            field: edu.field || null,
            start_date: edu.start_date || null,
            end_date: edu.end_date || null,
            description: edu.description || null,
          });
        }
      }
    }

    // 5. Update experiences
    if (Array.isArray(body.experiences)) {
      await supabaseAdmin.from("experiences").delete().eq("user_id", user.id);
      for (const exp of body.experiences) {
        if (exp && typeof exp === "object") {
          await supabaseAdmin.from("experiences").insert({
            user_id: user.id,
            company: exp.company || "Unknown Company",
            title: exp.title || "Title",
            location: exp.location || null,
            start_date: exp.start_date || null,
            end_date: exp.end_date || null,
            is_current: exp.is_current || false,
            description: exp.description || null,
          });
        }
      }
    }

    // 6. Update projects
    if (Array.isArray(body.projects)) {
      await supabaseAdmin.from("projects").delete().eq("user_id", user.id);
      for (const proj of body.projects) {
        if (proj && typeof proj === "object") {
          await supabaseAdmin.from("projects").insert({
            user_id: user.id,
            name: proj.name || "Project",
            description: proj.description || null,
            github_url: proj.github_url || null,
            live_url: proj.live_url || null,
            tech_stack: proj.tech_stack || [],
          });
        }
      }
    }

    // 7. Update certifications
    if (Array.isArray(body.certifications)) {
      await supabaseAdmin.from("certifications").delete().eq("user_id", user.id);
      for (const cert of body.certifications) {
        if (cert && typeof cert === "object" && cert.name) {
          await supabaseAdmin.from("certifications").insert({
            user_id: user.id,
            name: cert.name,
            issuer: cert.issuer || null,
            date: cert.date || null,
            summary: cert.summary || null,
          });
        }
      }
    }

    // 8. Update memory
    if (Array.isArray(body.memory)) {
      await supabaseAdmin.from("candidate_memory").delete().eq("user_id", user.id);
      for (const mem of body.memory) {
        if (mem && typeof mem === "object" && mem.topic) {
          await supabaseAdmin.from("candidate_memory").insert({
            user_id: user.id,
            topic: mem.topic,
            answer: mem.answer || mem.content || "",
            category: mem.category || "general",
            source: mem.source || "manual",
            is_active: mem.is_active ?? true,
          });
        }
      }
    }

    // Return the fresh unified state
    const [profile, baseProfile, memory, skills, projects, education, experiences, certifications] =
      await Promise.all([
        supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabaseAdmin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabaseAdmin.from("candidate_memory").select("*").eq("user_id", user.id),
        supabaseAdmin.from("skills").select("*").eq("user_id", user.id),
        supabaseAdmin.from("projects").select("*").eq("user_id", user.id),
        supabaseAdmin.from("education").select("*").eq("user_id", user.id),
        supabaseAdmin.from("experiences").select("*").eq("user_id", user.id),
        supabaseAdmin.from("certifications").select("*").eq("user_id", user.id),
      ]);

    return json({
      profile: profile.data || {},
      baseProfile: baseProfile.data || {},
      memory: memory.data || [],
      skills: skills.data || [],
      projects: projects.data || [],
      education: education.data || [],
      experiences: experiences.data || [],
      certifications: certifications.data || [],
    });
  }

  return methodNotAllowed(["GET", "PUT", "POST"]);
}

async function handleApplicationPackage(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ jobId: string; companyName: string; applicationId: string }>(
    request,
  );

  const [brain, job, research, application] = await Promise.all([
    supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", body.jobId)
      .maybeSingle(),
    supabaseAdmin
      .from("company_research")
      .select("*")
      .eq("user_id", user.id)
      .eq("company_name", body.companyName)
      .maybeSingle(),
    supabaseAdmin
      .from("applications")
      .select("*")
      .eq("id", body.applicationId)
      .eq("user_id", user.id)
      .single(),
  ]);

  const score = job.data?.match_score ?? 0;
  const tier = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";

  await supabaseAdmin
    .from("applications")
    .update({ tier, match_score: score, package_generated: true } as any)
    .eq("id", body.applicationId)
    .eq("user_id", user.id);

  try {
    const qaResult = await callOpenRouterJson<{ qa: { question: string; answer: string }[] }>(
      [
        {
          role: "system",
          content:
            'Generate 5 likely custom application questions based on the job description and answer them perfectly using the candidate\'s background. Return strict JSON {"qa": [{"question": "", "answer": ""}]}',
        },
        {
          role: "user",
          content: `Candidate:\n${JSON.stringify(brain.data ?? {})}\n\nJob:\n${job.data?.description ?? ""}\n\nCompany:\n${JSON.stringify(research.data ?? {})}`,
        },
      ],
      "application_qa",
      {
        type: "object",
        properties: {
          qa: {
            type: "array",
            items: {
              type: "object",
              properties: { question: { type: "string" }, answer: { type: "string" } },
            },
          },
        },
      },
      { userId: user.id },
    );

    // Store generated answers in application_answers table
    const storedAnswers = [];
    for (const qa of qaResult.data.qa ?? []) {
      try {
        const { data: ansData } = await supabaseAdmin
          .from("application_answers")
          .insert({
            user_id: user.id,
            application_id: body.applicationId,
            question: qa.question,
            answer: qa.answer,
            source: "ai",
          })
          .select("*")
          .single();
        if (ansData) storedAnswers.push(ansData);
      } catch (err) {
        logger.warn("[...route] storing application answer failed (table may not exist)", err);
        storedAnswers.push(qa);
      }
    }

    // Auto-create follow-up for the application
    await supabaseAdmin.from("followups").insert({
      user_id: user.id,
      application_id: body.applicationId,
      due_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      note: `Follow up on ${body.companyName} application — package generated (Tier ${tier})`,
      done: false,
    });

    await emitWorkflowEvent({
      userId: user.id,
      eventType: "application_package_generated",
      entityType: "applications",
      entityId: body.applicationId,
      payload: { companyName: body.companyName, tier, qaCount: qaResult.data.qa?.length ?? 0 },
    });

    return json({ tier, qa: qaResult.data.qa, storedAnswers });
  } catch (e: any) {
    return json({ error: safeErrorMessage(e) }, { status: 400 });
  }
}

async function handleInterviewPrep(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ interviewId: string; companyName: string; roleTitle: string }>(
    request,
  );

  const [brain, research, existing] = await Promise.all([
    supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabaseAdmin
      .from("company_research")
      .select("*")
      .eq("user_id", user.id)
      .eq("company_name", body.companyName)
      .maybeSingle(),
    supabaseAdmin
      .from("interview_preparation")
      .select("id")
      .eq("user_id", user.id)
      .eq("interview_id", body.interviewId)
      .maybeSingle(),
  ]);

  if (existing.data?.id) {
    return json({ message: "Preparation already exists." });
  }

  try {
    const prepResult = await callOpenRouterJson<{
      topics: { title: string; content: string; resources: string[] }[];
    }>(
      [
        {
          role: "system",
          content:
            "Generate an interview preparation briefing with exactly 5 topics: 'Company Briefing', 'Role Briefing', 'Project Mapping', 'Likely Questions', and 'Preparation Notes'. For each topic, provide detailed notes/content and 2-3 relevant resource, documentation, or practice URLs (e.g. Supabase docs, LeetCode, GitHub, company engineering blog). Return strict JSON with a 'topics' array containing objects with 'title', 'content', and 'resources' fields.",
        },
        {
          role: "user",
          content: `Company: ${body.companyName}\nRole: ${body.roleTitle}\n\nCandidate Brain: ${JSON.stringify(brain.data ?? {})}\n\nCompany Research: ${JSON.stringify(research.data ?? {})}`,
        },
      ],
      "interview_prep",
      {
        type: "object",
        properties: {
          topics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                resources: { type: "array", items: { type: "string" } },
              },
              required: ["title", "content", "resources"],
            },
          },
        },
        required: ["topics"],
      },
      { userId: user.id },
    );

    for (const topic of prepResult.data.topics) {
      await supabaseAdmin.from("interview_preparation").insert({
        user_id: user.id,
        interview_id: body.interviewId,
        topic: topic.title,
        notes: topic.content,
        completed: false,
        resources: topic.resources || [],
      } as any);
    }

    await emitWorkflowEvent({
      userId: user.id,
      eventType: "interview_prep_generated",
      entityType: "interviews",
      entityId: body.interviewId,
      payload: { companyName: body.companyName },
    });

    return json({ success: true, topics: prepResult.data.topics });
  } catch (e: any) {
    return json({ error: safeErrorMessage(e) }, { status: 400 });
  }
}

async function handleCompanyRoute(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ companyName: string }>(request);

  if (!body.companyName) {
    return json({ error: "companyName is required" }, { status: 400 });
  }

  // 1. Get primary or latest resume
  const primaryResume = await supabaseAdmin
    .from("resumes")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();

  let resumeId = primaryResume.data?.id;
  if (!resumeId) {
    const latestResume = await supabaseAdmin
      .from("resumes")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    resumeId = latestResume.data?.id;
  }

  if (!resumeId) {
    return json(
      { error: "Please upload a resume first to run the High Value Target pipeline." },
      { status: 400 },
    );
  }

  // 2. Assess company (Quality Score, Strategic Value Score, Founder detection)
  // Retrieve existing company research context if available
  const { data: existingResearch } = await supabaseAdmin
    .from("company_research")
    .select("*")
    .eq("user_id", user.id)
    .eq("company_name", body.companyName)
    .maybeSingle();

  const prompt = `Assess the company "${body.companyName}".
Calculate:
1. Quality Score (0-100) based on perceived engineering quality, stability, and product strength.
2. Strategic Value Score (0-100) based on alignment with technology careers, growth, and reputation.
3. Founder detection: Detect if there is a founder contact. Never fabricate founder records. Search company website, Crunchbase, LinkedIn company page, other verified sources. If a founder cannot be verified, set founder = null. Otherwise return the founder's name and verified profile URL.

Return a strict JSON object with:
{
  "company_quality_score": number,
  "strategic_value_score": number,
  "founder": {
    "name": string,
    "profile_url": string
  } | null
}`;

  const assessment = await callOpenRouterJson<{
    company_quality_score: number;
    strategic_value_score: number;
    founder: { name: string; profile_url: string } | null;
  }>(
    [
      {
        role: "system",
        content:
          "You are a company assessment and founder detection engine. Ground your assessments in real information. Never fabricate founder names or profile URLs. If they cannot be verified, return null for founder.",
      },
      {
        role: "user",
        content: `${prompt}\n\nExisting Research context (if any):\n${JSON.stringify(existingResearch ?? {})}`,
      },
    ],
    "company_assessment",
    {
      type: "object",
      properties: {
        company_quality_score: { type: "integer", minimum: 0, maximum: 100 },
        strategic_value_score: { type: "integer", minimum: 0, maximum: 100 },
        founder: {
          type: ["object", "null"],
          properties: {
            name: { type: "string" },
            profile_url: { type: "string" },
          },
          required: ["name", "profile_url"],
        },
      },
      required: ["company_quality_score", "strategic_value_score", "founder"],
    },
    { userId: user.id },
  ).catch(() => ({
    data: {
      company_quality_score: 60,
      strategic_value_score: 60,
      founder: null,
    },
  }));

  const qualityScore = assessment.data.company_quality_score;
  const strategicValueScore = assessment.data.strategic_value_score;
  const targetValue = (qualityScore + strategicValueScore) / 2 >= 75 ? "high" : "normal";
  const founder = assessment.data.founder;

  // 3. Upsert company record
  const existingCompany = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .ilike("name", body.companyName)
    .maybeSingle();

  const companyPayload = {
    user_id: user.id,
    name: body.companyName,
    target_value: targetValue,
    company_quality_score: qualityScore,
    hiring_activity_score: strategicValueScore,
    strategic_value_score: strategicValueScore,
    founder_detected: founder !== null,
  };

  let companyId: string;
  if (existingCompany.data?.id) {
    companyId = existingCompany.data.id;
    await supabaseAdmin
      .from("companies")
      .update(companyPayload)
      .eq("id", companyId)
      .eq("user_id", user.id);
  } else {
    const insertResult = await supabaseAdmin
      .from("companies")
      .insert(companyPayload)
      .select("id")
      .single();
    if (insertResult.error || !insertResult.data) {
      return json(
        { error: insertResult.error?.message ?? "Failed to save company target values." },
        { status: 400 },
      );
    }
    companyId = insertResult.data.id;
  }

  if (targetValue === "normal") {
    return json({
      status: "normal",
      target_value: "normal",
      company_quality_score: qualityScore,
      strategic_value_score: strategicValueScore,
      founder: null,
      message: "Normal Application Flow. strategic action blocks are active.",
    });
  }

  // 4. Handle High Value routing flow
  // Insert the detected founder as a recruiter contact if found
  let recruiterId: string | null = null;
  if (founder) {
    const existingRecruiter = await supabaseAdmin
      .from("recruiters")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", founder.name)
      .maybeSingle();

    const recruiterPayload = {
      user_id: user.id,
      name: founder.name,
      company: body.companyName,
      role: "Hiring Manager",
      title: "Founder / Executive",
      profile_url: founder.profile_url,
      source: "discovery",
      discovered_via: "Founder Detection",
      relevance_score: 1.0,
      notes: "Auto-detected Founder contact.",
    };

    if (existingRecruiter.data?.id) {
      recruiterId = existingRecruiter.data.id;
      await supabaseAdmin
        .from("recruiters")
        .update(recruiterPayload)
        .eq("id", recruiterId)
        .eq("user_id", user.id);
    } else {
      const recResult = await supabaseAdmin
        .from("recruiters")
        .insert(recruiterPayload)
        .select("id")
        .single();
      if (!recResult.error && recResult.data) {
        recruiterId = recResult.data.id;
      }
    }
  }

  // Trigger Research (which also generates pain points)
  const authHeader = request.headers.get("authorization") ?? "";
  const requestInit = (path: string, payload: unknown) =>
    new Request(`${getBaseUrl(request)}/api/${path}`, {
      method: "POST",
      headers: {
        authorization: authHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

  const researchResponse = await handleCompanyResearch(
    requestInit("company-research/generate", {
      companyName: body.companyName,
      companyId: companyId,
    }),
  );
  if (!researchResponse.ok) return researchResponse;
  const researchData = await researchResponse.json();

  // Trigger Loom script generation
  const loomResponse = await handleLoom(
    requestInit("loom/script", {
      companyName: body.companyName,
      resumeId: resumeId,
      recruiterId: recruiterId ?? undefined,
    }),
  );
  if (!loomResponse.ok) return loomResponse;
  const loomData = await loomResponse.json();

  // Trigger Outreach Campaign
  const campaignResponse = await handleOutreachCampaign(
    requestInit("outreach/campaign", {
      companyName: body.companyName,
      resumeId: resumeId,
      recruiterId: recruiterId ?? undefined,
    }),
  );
  if (!campaignResponse.ok) return campaignResponse;
  const campaignData = await campaignResponse.json();

  return json({
    status: "high",
    target_value: "high",
    company_quality_score: qualityScore,
    strategic_value_score: strategicValueScore,
    founder: founder,
    research: researchData,
    loom: loomData,
    campaign: campaignData,
  });
}

async function handleCompanyTarget(request: Request) {
  const user = await requireApiUser(request);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const companyName = url.searchParams.get("companyName");
    if (!companyName) return json({ error: "companyName is required" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("user_id", user.id)
      .ilike("name", companyName)
      .maybeSingle();

    if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });
    return json(
      data ?? {
        name: companyName,
        target_value: "normal",
        company_quality_score: 0,
        hiring_activity_score: 0,
        strategic_value_score: 0,
      },
    );
  }

  if (request.method === "POST" || request.method === "PUT") {
    const body = await readJson<{
      companyName: string;
      targetValue: "normal" | "high";
      companyQualityScore?: number;
      hiringActivityScore?: number;
      strategicValueScore?: number;
    }>(request);

    const existing = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", body.companyName)
      .maybeSingle();

    const payload = {
      user_id: user.id,
      name: body.companyName,
      target_value: body.targetValue,
      company_quality_score: body.companyQualityScore ?? 0,
      hiring_activity_score: body.hiringActivityScore ?? 0,
      strategic_value_score: body.strategicValueScore ?? 0,
    };

    let result;
    if (existing.data?.id) {
      result = await supabaseAdmin
        .from("companies")
        .update(payload)
        .eq("id", existing.data.id)
        .eq("user_id", user.id)
        .select("*")
        .single();
    } else {
      result = await supabaseAdmin.from("companies").insert(payload).select("*").single();
    }

    if (result.error) return json({ error: safeErrorMessage(result.error) }, { status: 400 });
    return json(result.data);
  }

  return methodNotAllowed(["GET", "POST", "PUT"]);
}

async function handleFollowUps(request: Request) {
  const user = await requireApiUser(request);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const applicationId = url.searchParams.get("applicationId");
    const done = url.searchParams.get("done");
    let q = supabaseAdmin
      .from("followups")
      .select("*")
      .eq("user_id", user.id)
      .order("due_at", { ascending: true });
    if (applicationId) q = q.eq("application_id", applicationId);
    if (done !== null && done !== undefined) q = q.eq("done", done === "true");
    const { data, error } = await q;
    if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });
    return json(data ?? []);
  }

  if (request.method === "POST") {
    const body = await readJson<{
      applicationId?: string;
      recruiterId?: string;
      dueAt: string;
      note?: string;
    }>(request);
    const { data, error } = await supabaseAdmin
      .from("followups")
      .insert({
        user_id: user.id,
        application_id: body.applicationId || null,
        recruiter_id: body.recruiterId || null,
        due_at: body.dueAt,
        note: body.note || null,
        done: false,
      })
      .select("*")
      .single();
    if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });
    return json(data);
  }

  if (request.method === "PUT") {
    const body = await readJson<{ id: string; done?: boolean; note?: string; dueAt?: string }>(
      request,
    );
    const updatePayload: any = {};
    if (body.done !== undefined) updatePayload.done = body.done;
    if (body.note !== undefined) updatePayload.note = body.note;
    if (body.dueAt !== undefined) updatePayload.due_at = body.dueAt;

    const { data, error } = await supabaseAdmin
      .from("followups")
      .update(updatePayload)
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });
    return json(data);
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id is required" }, { status: 400 });
    const { error } = await supabaseAdmin
      .from("followups")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });
    return json({ success: true });
  }

  return methodNotAllowed(["GET", "POST", "PUT", "DELETE"]);
}

async function handleRecruiterDiscovery(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ companyName: string; roleTitle?: string }>(request);

  // Find existing recruiters for this company
  const { data: existingRecruiters } = await supabaseAdmin
    .from("recruiters")
    .select("*")
    .eq("user_id", user.id)
    .ilike("company", body.companyName);

  // Get company research for context
  const { data: research } = await supabaseAdmin
    .from("company_research")
    .select("*")
    .eq("user_id", user.id)
    .eq("company_name", body.companyName)
    .maybeSingle();

  // Use AI to discover potential recruiters and hiring managers
  const discoveryResult = await withTimeout(
    callOpenRouterJson<{
      recruiters: Array<{
        name: string;
        title: string;
        role: "Recruiter" | "Hiring Manager" | "Engineering Manager";
        profile_url: string | null;
        reason: string;
        searchQuery: string;
      }>;
    }>(
      [
        {
          role: "system",
          content:
            "You are a recruiter discovery engine. Based on the company name, role, and research context, generate a list of likely recruiters, hiring managers, and engineering managers involved in hiring. Return strict JSON with realistic names, titles, classified roles ('Recruiter', 'Hiring Manager', or 'Engineering Manager') and verified profile URLs if they exist in the context (else return null, NEVER fabricate recruiter profile URLs).",
        },
        {
          role: "user",
          content: `Company: ${body.companyName}\nRole: ${body.roleTitle ?? "Software Engineer"}\nExisting contacts: ${JSON.stringify(existingRecruiters ?? [])}\nResearch: ${JSON.stringify(research ?? {})}`,
        },
      ],
      "recruiter_discovery",
      {
        type: "object",
        properties: {
          recruiters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                title: { type: "string" },
                role: {
                  type: "string",
                  enum: ["Recruiter", "Hiring Manager", "Engineering Manager"],
                },
                profile_url: { type: ["string", "null"] },
                reason: { type: "string" },
                searchQuery: { type: "string" },
              },
              required: ["name", "title", "role", "profile_url", "reason", "searchQuery"],
            },
          },
        },
        required: ["recruiters"],
      },
      { userId: user.id },
    ),
    30000,
    "Recruiter discovery",
  ).catch(() => ({
    data: {
      recruiters: [],
    },
    model: "local-fallback:recruiter-discovery",
    usage: null,
    source: "env" as const,
  }));

  const insertedRecruiters = [];
  for (const rec of discoveryResult.data.recruiters) {
    // Check if already exists
    const existing = await supabaseAdmin
      .from("recruiters")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", rec.name)
      .maybeSingle();

    if (existing.data?.id) {
      const { data } = await supabaseAdmin
        .from("recruiters")
        .update({
          title: rec.title,
          role: rec.role,
          profile_url: rec.profile_url ?? null,
          relevance_score: 0.9,
          notes: `${rec.title}\n\n${rec.reason}\n\nSearch: ${rec.searchQuery}`,
        })
        .eq("id", existing.data.id)
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (data) insertedRecruiters.push(data);
      continue;
    }

    const { data, error } = await supabaseAdmin
      .from("recruiters")
      .insert({
        user_id: user.id,
        name: rec.name,
        company: body.companyName,
        title: rec.title,
        role: rec.role,
        profile_url: rec.profile_url ?? null,
        source: "discovery",
        discovered_via: "AI Discovery",
        relevance_score: 0.9,
        notes: `${rec.title}\n\n${rec.reason}\n\nSearch: ${rec.searchQuery}`,
      })
      .select("*")
      .single();

    if (!error && data) {
      insertedRecruiters.push(data);
    }
  }

  if (insertedRecruiters.length) {
    await emitWorkflowEvent({
      userId: user.id,
      eventType: "recruiter_discovery_completed",
      entityType: "recruiters",
      payload: {
        companyName: body.companyName,
        recruiterIds: insertedRecruiters.map((r: any) => r.id),
      },
    });
  }

  return json({ recruiters: insertedRecruiters, companyName: body.companyName });
}

async function handleApplicationAnswers(request: Request) {
  const user = await requireApiUser(request);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const applicationId = url.searchParams.get("applicationId");
    if (!applicationId) return json({ error: "applicationId is required" }, { status: 400 });

    // Try application_answers table first, fall back gracefully
    try {
      const { data, error } = await supabaseAdmin
        .from("application_answers")
        .select("*")
        .eq("user_id", user.id)
        .eq("application_id", applicationId)
        .order("created_at", { ascending: true });

      if (error) {
        // Table may not exist yet — return empty array
        return json([]);
      }
      return json(data ?? []);
    } catch (err) {
      logger.error("[...route] fetching application answers failed", err);
      return json([]);
    }
  }

  if (request.method === "POST") {
    const body = await readJson<{
      applicationId: string;
      answers: Array<{ question: string; answer: string }>;
    }>(request);

    const inserted = [];
    for (const qa of body.answers) {
      try {
        const { data, error } = await supabaseAdmin
          .from("application_answers")
          .insert({
            user_id: user.id,
            application_id: body.applicationId,
            question: qa.question,
            answer: qa.answer,
            source: "ai",
          })
          .select("*")
          .single();

        if (!error && data) {
          inserted.push(data);
        }
      } catch (err) {
        logger.warn("[...route] inserting application answer failed (table may not exist)", err);
      }
    }

    return json(inserted);
  }

  return methodNotAllowed(["GET", "POST"]);
}

async function handleInterviewsWithPrep(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);

  const { data: interviews, error } = await supabaseAdmin
    .from("interviews")
    .select("*")
    .eq("user_id", user.id)
    .order("scheduled_at", { ascending: false });

  if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });

  // Enrich with prep status
  const enriched = [];
  for (const iv of interviews ?? []) {
    const { data: prep, count } = await supabaseAdmin
      .from("interview_preparation")
      .select("id, topic, completed", { count: "exact" })
      .eq("user_id", user.id)
      .eq("interview_id", iv.id);

    const prepTopics = prep ?? [];
    const completedCount = prepTopics.filter((p: any) => p.completed).length;

    enriched.push({
      ...iv,
      prepTopics,
      prepCount: count ?? 0,
      prepCompleted: completedCount,
      prepReady: count ? completedCount === count : false,
    });
  }

  return json(enriched);
}

async function handleFollowUpAutoCreate(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{
    applicationId: string;
    companyName: string;
    action: "applied" | "screening" | "interview" | "offer";
  }>(request);

  const followUpConfig: Record<string, { days: number; note: string }> = {
    applied: {
      days: 5,
      note: `Follow up on application at ${body.companyName} — check if reviewed`,
    },
    screening: {
      days: 3,
      note: `Follow up after screening at ${body.companyName} — request next steps`,
    },
    interview: { days: 2, note: `Send thank-you note after interview at ${body.companyName}` },
    offer: { days: 1, note: `Respond to offer from ${body.companyName}` },
  };

  const config = followUpConfig[body.action];
  if (!config) return json({ error: "Invalid action" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("followups")
    .insert({
      user_id: user.id,
      application_id: body.applicationId,
      due_at: new Date(Date.now() + config.days * 86400000).toISOString(),
      note: config.note,
      done: false,
    })
    .select("*")
    .single();

  if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "followup_auto_created",
    entityType: "followups",
    entityId: data.id,
    payload: {
      applicationId: body.applicationId,
      companyName: body.companyName,
      action: body.action,
    },
  });

  return json(data);
}

async function resolveUserIdFromTelegramChat(chatId: number): Promise<string> {
  // Primary: telegram_bindings (multi-user)
  const { data: binding } = await supabaseAdmin
    .from("telegram_bindings")
    .select("user_id")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (binding?.user_id) return binding.user_id;
  // Fallback: telegram_notifications (legacy)
  const { data } = await supabaseAdmin
    .from("telegram_notifications")
    .select("user_id")
    .eq("chat_id", String(chatId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.user_id) return data.user_id;
  // Unbound chat — return empty so processTelegramUpdate shows "not connected" prompt
  return "";
}

// Per-chat rate limit state for Telegram webhook (max 10 req / 3s per chat)
const tgChatRateMap = new Map<string, number[]>();

async function handleTelegramWebhook(request: Request) {
  if (request.method !== "POST") {
    return json({ error: "Use POST" }, { status: 405 });
  }
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secretToken) {
    const headerToken = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (headerToken !== secretToken) {
      return json({ error: "Invalid secret token" }, { status: 403 });
    }
  }
  const body = await request.json();
  const chatId = body.message?.chat?.id ?? body.callback_query?.message?.chat?.id;

  // Per-chat rate limiting: max 10 requests per 3 seconds per chat
  if (chatId) {
    const chatKey = `tg:${chatId}`;
    const now = Date.now();
    const chatWindow: number[] = (tgChatRateMap.get(chatKey) ?? []).filter((t) => now - t < 3000);
    if (chatWindow.length >= 10) {
      return json({ handled: false, error: "rate_limited" });
    }
    chatWindow.push(now);
    tgChatRateMap.set(chatKey, chatWindow);
  }

  let userId = "";
  if (chatId) userId = await resolveUserIdFromTelegramChat(chatId);
  const result = await processTelegramUpdate(body, userId);
  return json({ handled: result.handled });
}

async function handleTelegramBinding(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const { generateBindingToken } = await import("./_lib/telegram-bindings.js");
  const result = await generateBindingToken(user.id);
  return json(result);
}

// Phase A + B route handlers — see api/phase-handlers.ts
import * as phase from "./phase-handlers.js";
import { runCycle } from "./_lib/workflow-runner.js";

async function handleCookiesRefresh(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ provider: string }>(request);
  const result = await checkProviderCookie(user.id, body.provider);
  return json(result);
}

async function handleCookiesValidate(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ provider: string; cookie?: string }>(request);
  if (body.cookie?.trim()) {
    const basic = validateCookieValue(body.cookie.trim());
    return json({
      valid: basic.valid,
      reason: basic.reason,
      status: basic.valid ? "pending" : "invalid",
    });
  }
  const result = await checkProviderCookie(user.id, body.provider);
  return json({ valid: result.status === "valid", reason: result.message, status: result.status });
}

async function handleCookiesSet(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ provider: string; cookie: string }>(request);
  if (!body.provider || !body.cookie?.trim()) {
    return json({ ok: false, message: "Provider and cookie value required" }, { status: 400 });
  }
  const result = await refreshProviderCookie(user.id, body.provider, body.cookie);
  return json(result);
}

async function handleCookiesList(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireApiUser(request);
  const statuses = await getAllCookieStatuses(user.id);
  return json({ cookies: statuses });
}

async function handleCookiesDelete(request: Request, provider: string) {
  if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  const user = await requireApiUser(request);
  const result = await deleteProviderCookie(user.id, provider);
  return json(result);
}

async function handleAuthCreateProfile(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ name?: string }>(request).catch(() => ({ name: undefined }));
  const name = body.name ?? user.email ?? "User";
  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      { id: user.id, name, email: user.email, created_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) return json({ error: safeErrorMessage(error) }, { status: 400 });
  return json({ ok: true });
}

async function handleAuthLogEvent(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<{ event: string }>(request);
  await supabaseAdmin.from("workflow_events").insert({
    user_id: user.id,
    event_type: body.event,
    entity_type: "auth",
    payload: { email: user.email },
  });
  return json({ ok: true });
}

export async function routeRequest(request: Request) {
  const url = new URL(request.url);
  const pathnameFromUrl = url.pathname.replace(/^\/api\//, "");
  const pathname =
    pathnameFromUrl === "[...route]"
      ? (url.searchParams.get("path") ?? url.searchParams.get("route") ?? "").replace(/^\/+/, "")
      : pathnameFromUrl;

  switch (pathname) {
    case "resumes/process":
      return handleResumeProcess(request);
    case "resumes/analyze":
      return handleResumeAnalyze(request);
    case "resumes/parse":
      return handleResumeParse(request);
    case "resumes/tailor":
      return handleResumeTailor(request);
    case "resumes/details":
      return handleResumeDetails(request);
    case "resumes/center":
      return handleResumeCenter(request);
    case "resumes/primary":
      return handleResumePrimary(request);
    case "resumes/delete":
      return handleResumeDelete(request);
    case "jobs/import":
      return handleJobsImport(request);
    case "jobs/match":
      return handleJobsMatch(request);
    case "company-research/generate":
      return handleCompanyResearch(request);
    case "painpoints/generate":
      return handlePainPoints(request);
    case "outreach/generate":
      return handleOutreach(request);
    case "outreach/campaign":
      return handleOutreachCampaign(request);
    case "loom/script":
      return handleLoom(request);
    case "analytics/summary":
      return handleAnalyticsSummary(request);
    case "analytics/daily-summary":
      return handleAnalyticsDailySummary(request);
    case "candidate-brain":
      return handleCandidateBrain(request);
    case "applications/generate-package":
      return handleApplicationPackage(request);
    case "applications/answers":
      return handleApplicationAnswers(request);
    case "interviews/prep":
      return handleInterviewPrep(request);
    case "interviews/with-prep":
      return handleInterviewsWithPrep(request);
    case "companies/target":
      return handleCompanyTarget(request);
    case "companies/route":
      return handleCompanyRoute(request);
    case "follow-ups":
      return handleFollowUps(request);
    case "follow-ups/auto-create":
      return handleFollowUpAutoCreate(request);
    case "recruiters/discover":
      return handleRecruiterDiscovery(request);
    // ── Phase A endpoints ──
    case "providers/audit":
      return phase.handleProviderAudit(request);
    case "providers/import":
      return phase.handleProviderImport(request);
    case "match/score":
      return phase.handleMatchScore(request);
    case "companies/strategic-value":
      return phase.handleStrategicValue(request);
    case "recruiters/discover-v2":
      return phase.handleRecruiterDiscoveryV2(request);
    case "apply":
      return phase.handleApply(request);
    case "batch-apply/run":
      return phase.handleBatchApply(request);
    case "batch-apply/eligibility":
      return phase.handleBatchEligibility(request);
    case "outreach/v2":
      return phase.handleOutreachV2(request);
    case "followups/schedule":
      return phase.handleFollowupSchedule(request);
    case "followups/generate":
      return phase.handleFollowupGenerate(request);
    case "followups/due":
      return phase.handleFollowupDue(request);
    case "followups/mark-sent":
      return phase.handleFollowupMarkSent(request);
    case "inbox/sync":
      return phase.handleInboxSync(request);
    case "inbox/classify":
      return phase.handleInboxClassify(request);
    case "inbox/list":
      return phase.handleInboxList(request);
    // ── Phase B endpoints ──
    case "browser/profiles":
      return phase.handleBrowserProfiles(request);
    case "browser/session":
      return phase.handleBrowserSession(request);
    case "browser/storage-state":
      return phase.handleBrowserStorageState(request);
    case "browser/capture":
      return phase.handleBrowserCapture(request);
    case "queue/enqueue":
      return phase.handleQueueEnqueue(request);
    case "queue/stats":
      return phase.handleQueueStats(request);
    case "event-bus/consumers":
      return phase.handleEventBusConsumers(request);
    case "event-bus/replay":
      return phase.handleEventBusReplay(request);
    case "event-bus/history":
      return phase.handleEventBusHistory(request);
    case "auth/create-profile":
      return handleAuthCreateProfile(request);
    case "auth/log-event":
      return handleAuthLogEvent(request);
    case "telegram/webhook":
      return handleTelegramWebhook(request);
    case "telegram/binding":
      return handleTelegramBinding(request);
    // ── Phase P endpoints ──
    case "recruiters/discover-v3":
      return phase.handleRecruiterDiscoveryV3(request);
    case "email/discover":
      return phase.handleEmailDiscovery(request);
    case "companies/strategic-value-v3":
      return phase.handleHighValueV3(request);
    case "applications/evidence":
      return phase.handlePlaywrightEvidence(request);
    case "approvals/status":
      return phase.handleApprovalStatus(request);
    case "skills/gap":
      return handleSkillGap(request);
    case "outreach/send":
      return handleOutreachSend(request);
    case "outreach/send-pending":
      return handleOutreachSendPending(request);
    case "precheck/workflow":
      return phase.handleWorkflowPrecheck(request);
    case "workflow/validate":
      return phase.handleWorkflowValidate(request);
    case "workflow/cycle":
      return handleWorkflowCycle(request);
    case "admin":
      return handleAdminArea(request);
    case "admin/users":
      return handleAdminUsers(request);
    case "admin/providers":
      return handleAdminProviders(request);
    case "admin/queue":
      return handleAdminQueue(request);
    case "admin/logs":
      return handleAdminLogs(request);
    case "admin/broadcast":
      return handleAdminBroadcast(request);
    case "cookies/refresh":
      return handleCookiesRefresh(request);
    case "cookies/validate":
      return handleCookiesValidate(request);
    case "cookies/set":
      return handleCookiesSet(request);
    case "cookies/list":
      return handleCookiesList(request);
    case "health":
    case "api/health":
      return handleHealthCheck();
    default: {
      const adminUserInspect = pathname.match(/^admin\/users\/([^/]+)\/inspect$/);
      if (adminUserInspect) {
        return handleAdminUserInspect(request, adminUserInspect[1]);
      }
      const m = pathname.match(/^cookies\/(\w+)$/);
      if (m && request.method === "DELETE") {
        return handleCookiesDelete(request, m[1]);
      }
      return json({ error: `Unknown API route: /api/${pathname}` }, { status: 404 });
    }
  }
}

function isAdmin(user: { email?: string }): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  return adminEmails.length > 0 && adminEmails.includes((user.email ?? "").toLowerCase());
}

async function requireAdmin(request: Request) {
  const user = await requireApiUser(request);
  if (!isAdmin(user))
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  return user;
}

async function handleAdminUserInspect(request: Request, targetUserId: string) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  await requireAdmin(request);

  const [profiles, candidate, apps, wfState, tgBindings, providers] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("id", targetUserId).maybeSingle(),
    supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", targetUserId).maybeSingle(),
    supabaseAdmin.from("applications").select("*").eq("user_id", targetUserId).limit(20),
    supabaseAdmin.from("workflow_state").select("*").eq("user_id", targetUserId).maybeSingle(),
    supabaseAdmin.from("telegram_bindings").select("*").eq("user_id", targetUserId).maybeSingle(),
    supabaseAdmin.from("provider_controls").select("*").eq("user_id", targetUserId),
  ]);

  return json({
    profile: profiles.data ?? null,
    candidateProfile: candidate.data ?? null,
    applications: apps.data ?? [],
    workflowState: wfState.data ?? null,
    telegramBinding: tgBindings.data ?? null,
    providers: providers.data ?? [],
  });
}

async function handleAdminArea(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const user = await requireAdmin(request);

  const [providers, users, workflowStates, bindings, logs] = await Promise.all([
    supabaseAdmin.from("provider_controls").select("*").order("provider"),
    supabaseAdmin.from("profiles").select("id, name, email").limit(50),
    supabaseAdmin.from("workflow_state").select("*"),
    supabaseAdmin.from("telegram_bindings").select("*"),
    supabaseAdmin
      .from("workflow_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return json({
    providers: providers.data ?? [],
    users: users.data ?? [],
    workflowStates: workflowStates.data ?? [],
    telegramBindings: bindings.data ?? [],
    recentLogs: logs.data ?? [],
  });
}

async function handleAdminUsers(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  await requireAdmin(request);
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, created_at, location")
    .limit(100);
  return json(data ?? []);
}

async function handleAdminProviders(request: Request) {
  await requireAdmin(request);
  const url = new URL(request.url);
  if (request.method === "POST") {
    const body = await readJson<{
      provider: string;
      action: "enable" | "disable" | "pause" | "resume";
      userId?: string;
    }>(request);
    const updateQuery = supabaseAdmin
      .from("provider_controls")
      .update({ status: body.action })
      .eq("provider", body.provider);
    if (body.userId) updateQuery.eq("user_id", body.userId);
    await updateQuery;
    return json({ ok: true });
  }
  const { data } = await supabaseAdmin.from("provider_controls").select("*").order("provider");
  return json(data ?? []);
}

async function handleAdminQueue(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  await requireAdmin(request);
  const { isQueueAvailable } = await import("./_lib/queue.js");
  const { data: queueJobs } = await supabaseAdmin.from("queue_jobs").select("queue_name, status");
  const redisAvailable = await isQueueAvailable();
  const stats: Record<string, Record<string, number>> = {};
  for (const row of queueJobs ?? []) {
    const q = (row as any).queue_name;
    const s = (row as any).status;
    stats[q] ??= {};
    stats[q][s] = (stats[q][s] ?? 0) + 1;
  }
  return json({ redisAvailable, stats, total: queueJobs?.length ?? 0 });
}

async function handleAdminLogs(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  await requireAdmin(request);
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const userId = url.searchParams.get("userId") ?? undefined;
  let query = supabaseAdmin
    .from("workflow_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  return json(data ?? []);
}

async function handleAdminBroadcast(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireAdmin(request);
  const body = await readJson<{ title: string; message: string; severity?: string }>(request);
  const { createNotification } = await import("./_lib/notification-center.js");
  const { data: users } = await supabaseAdmin.from("profiles").select("id");
  let sent = 0;
  for (const u of users ?? []) {
    await createNotification({
      userId: u.id,
      category: "health_alert",
      title: body.title,
      message: body.message,
      severity: (body.severity as any) ?? "info",
    });
    sent++;
  }
  return json({ ok: true, sent });
}

async function handleHealthCheck() {
  const start = Date.now();
  let dbOk = false;
  let dbError: string | null = null;
  try {
    const { count, error } = await supabaseAdmin
      .from("workflow_events")
      .select("*", { count: "exact", head: true })
      .limit(1);
    dbOk = !error;
    if (error) {
      dbError = "Database check failed";
    }
  } catch {
    dbError = "Database check failed";
  }

  let redisOk = false;
  let redisError: string | null = null;
  try {
    const { Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    redisOk = true;
    await redis.quit();
  } catch {
    redisError = "Redis check failed";
  }

  return json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: { ok: dbOk, error: dbError, latencyMs: Date.now() - start },
      redis: { ok: redisOk, error: redisError },
      version: "1.0.0",
    },
  });
}

async function handleSkillGap(request: Request) {
  const user = await requireApiUser(request);
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const body = await readJson<{
    candidateSkills: string[];
    jobDescription: string;
    useAi?: boolean;
  }>(request);
  if (!body.candidateSkills?.length || !body.jobDescription) {
    return json({ error: "candidateSkills and jobDescription are required" }, { status: 400 });
  }
  const { analyzeSkillGap, analyzeSkillGapWithAi } = await import("./_lib/skill-gap.js");
  const result = body.useAi
    ? await analyzeSkillGapWithAi(body.candidateSkills, body.jobDescription, user.id)
    : analyzeSkillGap(body.candidateSkills, body.jobDescription);
  return json(result);
}

async function handleOutreachSend(request: Request) {
  const user = await requireApiUser(request);
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const body = await readJson<{ outreachId?: string }>(request);
  const { sendOutreachMessage, sendPendingOutreaches } = await import("./_lib/outreach-sender.js");
  if (body.outreachId) {
    const ok = await sendOutreachMessage(body.outreachId, user.id);
    return json({ sent: ok });
  }
  const result = await sendPendingOutreaches(50, user.id);
  return json(result);
}

async function handleOutreachSendPending(request: Request) {
  const user = await requireApiUser(request);
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const { sendPendingOutreaches } = await import("./_lib/outreach-sender.js");
  const result = await sendPendingOutreaches(50, user.id);
  return json(result);
}

async function handleWorkflowCycle(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  try {
    const user = await requireApiUser(request);
    const result = await runCycle(user.id);
    return json(result);
  } catch (err: any) {
    return json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

export async function safeRouteRequest(request: Request) {
  const url = new URL(request.url);
  const OPTIONS = handleCorsPreflight(request);
  if (OPTIONS) return OPTIONS;

  const { allowed, remaining, resetAt } = checkRateLimit(rateLimitKey(request));

  if (!allowed) {
    logger.warn("Rate limit exceeded", {
      path: url.pathname,
      method: request.method,
      remote: rateLimitKey(request),
    });
    const resp = json(
      { error: "Too many requests. Please slow down.", retryAfterMs: resetAt - Date.now() },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.ceil((resetAt - Date.now()) / 1000)),
          "x-ratelimit-remaining": "0",
        },
      },
    );
    return addCorsHeaders(resp, request);
  }

  try {
    const response = await routeRequest(request);
    if (response.status === 200) {
      (response.headers as any).set?.("x-ratelimit-remaining", String(remaining));
    }
    return addCorsHeaders(response, request);
  } catch (error) {
    if (error instanceof Response) return addCorsHeaders(error, request);
    logger.error("API ROUTE ERROR", {
      path: url.pathname,
      method: request.method,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// Initialize Sentry at module load time
initSentry();

// Initialize Telegram bot (commands + webhook if PUBLIC_URL set)
initTelegramBot();

export default async function handler(request: Request) {
  return safeRouteRequest(request);
}
(handler as any).fetch = safeRouteRequest;

export { safeRouteRequest as fetch };

// Re-export for downstream usage
export { analyzeSkillGap, analyzeSkillGapWithAi } from "./_lib/skill-gap.js";
export type { SkillGapResult, SkillRecommendation } from "./_lib/skill-gap.js";
export { sendOutreachMessage, sendPendingOutreaches } from "./_lib/outreach-sender.js";
export { withRetry } from "./_lib/retry.js";
export type { RetryOptions } from "./_lib/retry.js";
