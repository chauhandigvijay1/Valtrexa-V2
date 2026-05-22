import type { ResumeStructuredData } from "./resume-parser";

type CompanyResearchFallbackInput = {
  companyName: string;
  websiteText: string;
  techStack: string[];
  newsData: string;
  sourceUrls: string[];
};

type PainPointSeed = {
  title?: string | null;
  description?: string | null;
  source?: string | null;
};

const STOPWORDS = new Set([
  "about",
  "ability",
  "across",
  "also",
  "and",
  "apply",
  "are",
  "based",
  "been",
  "being",
  "best",
  "both",
  "build",
  "building",
  "but",
  "can",
  "candidate",
  "come",
  "company",
  "could",
  "create",
  "current",
  "data",
  "day",
  "desired",
  "does",
  "each",
  "engineering",
  "etc",
  "every",
  "experience",
  "first",
  "for",
  "from",
  "get",
  "good",
  "great",
  "has",
  "have",
  "help",
  "high",
  "how",
  "ideal",
  "including",
  "into",
  "its",
  "job",
  "join",
  "just",
  "key",
  "knowledge",
  "like",
  "looking",
  "make",
  "may",
  "more",
  "must",
  "need",
  "new",
  "not",
  "one",
  "only",
  "opportunity",
  "other",
  "our",
  "over",
  "own",
  "part",
  "plus",
  "position",
  "preferred",
  "problem",
  "process",
  "product",
  "proficiency",
  "proven",
  "required",
  "requirements",
  "responsible",
  "role",
  "should",
  "skills",
  "software",
  "some",
  "strong",
  "such",
  "support",
  "take",
  "team",
  "technical",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "these",
  "they",
  "this",
  "through",
  "time",
  "two",
  "understand",
  "understanding",
  "use",
  "used",
  "using",
  "very",
  "well",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "work",
  "working",
  "would",
  "writing",
  "year",
  "years",
  "you",
  "your",
]);

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sentenceCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractKeywords(text: string, limit = 18) {
  const normalized = text
    .replace(/[^\w.+/#-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim().replace(/[.,;:!?]+$/, ""))
    .filter((token) => token.length > 2);

  const curated = normalized.filter((token) => {
    const lower = token.toLowerCase();
    return !STOPWORDS.has(lower) && /[a-z]/i.test(lower);
  });

  return unique(curated).slice(0, limit);
}

function scoreFromCoverage(matched: string[], missing: string[], baseline = 56) {
  return Math.max(18, Math.min(96, baseline + matched.length * 7 - missing.length * 4));
}

function buildFitSummary(companyName: string, matched: string[], missing: string[]) {
  if (!matched.length && !missing.length) {
    return `Insufficient structured evidence to score ${companyName} confidently, so the fallback kept the match conservative.`;
  }

  const matchedSummary = matched.length
    ? `Aligned strengths include ${matched.slice(0, 4).join(", ")}.`
    : "The resume does not show clear overlap with the highest-signal requirements yet.";
  const missingSummary = missing.length
    ? `Primary gaps are ${missing.slice(0, 4).join(", ")}.`
    : "No critical keyword gaps were detected from the provided description.";

  return `${matchedSummary} ${missingSummary}`.trim();
}

export function fallbackResumeAnalysis(resumeText: string, jobDescription: string) {
  const resumeKeywords = extractKeywords(resumeText, 48).map((item) => item.toLowerCase());
  const jobKeywords = extractKeywords(jobDescription, 18);
  const matched = jobKeywords.filter((keyword) => resumeKeywords.includes(keyword.toLowerCase()));
  const missing = jobKeywords.filter((keyword) => !resumeKeywords.includes(keyword.toLowerCase()));
  const atsScore = scoreFromCoverage(matched, missing, 58);

  return {
    atsScore,
    missingKeywords: missing.slice(0, 10),
    strengths: matched.length
      ? matched.slice(0, 5).map((keyword) => `Resume already signals ${keyword}.`)
      : ["Resume structure is present but the strongest role keywords are underrepresented."],
    weaknesses: missing.length
      ? missing.slice(0, 5).map((keyword) => `${keyword} is missing or too weak in the current resume.`)
      : ["No major keyword gaps were detected in the fallback analysis."],
    improvementSuggestions: missing.length
      ? missing.slice(0, 5).map((keyword) => `Add quantified evidence that proves ${keyword} experience where accurate.`)
      : ["Keep the summary and experience bullets aligned with the target role language."],
  };
}

export function fallbackTailoredResume(resumeText: string, jobDescription: string) {
  const analysis = fallbackResumeAnalysis(resumeText, jobDescription);
  const summary = analysis.missingKeywords.length
    ? `Target this role by emphasizing truthful evidence around ${analysis.missingKeywords.slice(0, 4).join(", ")}.`
    : "Target this role by keeping the strongest matching technologies and outcomes near the top.";

  return {
    optimizedResume: [
      "# Tailored Resume Draft",
      "",
      "## Positioning Summary",
      summary,
      "",
      "## Resume Source",
      resumeText.trim(),
    ].join("\n"),
    atsFriendlyResume: [
      "# ATS-Ready Resume",
      "",
      "## Target Keywords",
      analysis.missingKeywords.length ? analysis.missingKeywords.join(", ") : "No missing keywords detected.",
      "",
      "## Source Resume",
      resumeText.trim(),
    ].join("\n"),
    missingSkills: analysis.missingKeywords,
  };
}

export function fallbackJobMatch(companyName: string, resumeText: string, jobDescription: string) {
  const analysis = fallbackResumeAnalysis(resumeText, jobDescription);
  return {
    score: analysis.atsScore,
    skillsMatched: analysis.strengths
      .map((item) => item.match(/signals (.+)\./)?.[1])
      .filter((item): item is string => Boolean(item)),
    skillsMissing: analysis.missingKeywords,
    fitSummary: buildFitSummary(companyName, analysis.missingKeywords.length ? analysis.strengths.map((item) => item.replace(/^Resume already signals /, "").replace(/\.$/, "")) : [], analysis.missingKeywords),
    gapAnalysis: analysis.improvementSuggestions.join(" "),
  };
}

function takeSentences(text: string, limit: number) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, limit);
}

export function fallbackCompanyResearch(input: CompanyResearchFallbackInput) {
  const websiteSentences = takeSentences(input.websiteText, 2);
  const newsSentences = takeSentences(input.newsData.replace(/<[^>]+>/g, " "), 2);
  const products = unique(
    takeSentences(input.websiteText, 8)
      .flatMap((sentence) => sentence.split(/[,;:]/))
      .map((part) => part.trim())
      .filter((part) => part.length > 12),
  ).slice(0, 4);

  const hiringSignals = unique([
    input.techStack.length ? `Engineering stack mentions ${input.techStack.join(", ")}` : "",
    newsSentences[0] ? `Recent public mention: ${newsSentences[0]}` : "",
    websiteSentences[0] ? `Website messaging emphasizes: ${websiteSentences[0]}` : "",
  ]).slice(0, 4);

  return {
    summary:
      websiteSentences[0] ??
      `Fallback research for ${input.companyName} is based on the provided domain evidence and public news excerpts.`,
    products,
    recentNews: newsSentences.join(" ") || `No recent news excerpt was available for ${input.companyName}.`,
    hiringSignals,
    techStack: unique(input.techStack).slice(0, 8),
    fundingData: { status: "unknown", source: input.sourceUrls[0] ?? null },
    engineeringCultureNotes: hiringSignals.length
      ? `The available evidence suggests a product team working around ${hiringSignals.join("; ")}.`
      : `The available evidence for ${input.companyName} was limited, so this fallback kept the culture notes conservative.`,
  };
}

export function fallbackPainPoints(companyName: string, research: Record<string, unknown> | null, jobs: PainPointSeed[]) {
  const jobText = jobs
    .map((job) => [job.title, job.description].filter(Boolean).join(" "))
    .join(" ");
  const keywords = extractKeywords(jobText || JSON.stringify(research ?? {}), 8);
  const topKeyword = keywords[0] ?? "delivery";
  const secondKeyword = keywords[1] ?? "hiring";
  const sourceLabel = jobs[0]?.source ?? "company evidence";

  return {
    painPoints: [
      {
        title: `${sentenceCase(topKeyword)} capacity is being hired in multiple places`,
        category: "execution",
        description: `${companyName} appears to be hiring around ${topKeyword}, which usually signals delivery pressure or roadmap expansion.`,
        evidence: jobs[0]?.title
          ? `Observed in active job posting: ${jobs[0].title}.`
          : `Derived from the available company research and job evidence for ${companyName}.`,
        severity: 4,
        suggestedSolution: `Lead with concrete examples that reduce time-to-value for ${topKeyword} initiatives.`,
        signalSource: sourceLabel,
      },
      {
        title: `Hiring signal suggests a ${sentenceCase(secondKeyword)} coordination gap`,
        category: "process",
        description: `${companyName} is signalling sustained demand in adjacent areas, which usually means onboarding, prioritization, or knowledge-sharing pressure.`,
        evidence: keywords.length
          ? `Repeated fallback evidence terms included ${keywords.slice(0, 4).join(", ")}.`
          : `The company evidence set was small, so this point is intentionally conservative.`,
        severity: 3,
        suggestedSolution: `Frame outreach around faster execution, clearer delivery loops, and lower coordination overhead.`,
        signalSource: sourceLabel,
      },
    ],
  };
}

function candidateName(resume: ResumeStructuredData | Record<string, any>) {
  const name = "name" in resume ? resume.name : resume.full_name;
  return typeof name === "string" && name.trim() ? name.trim() : "the candidate";
}

export function fallbackOutreach(input: {
  type: string;
  companyName: string;
  recruiter?: Record<string, any> | null;
  resume: ResumeStructuredData | Record<string, any>;
  painPoints: Array<Record<string, any>>;
}) {
  const name = candidateName(input.resume);
  const firstPainPoint = input.painPoints[0]?.title ?? `the ${input.companyName} team priorities`;
  const subject = `${name} | can help with ${firstPainPoint}`;
  const recruiterName = input.recruiter?.name ? ` ${input.recruiter.name}` : "";
  const skills = Array.isArray(input.resume.skills) ? input.resume.skills.slice(0, 5).join(", ") : "relevant engineering delivery";

  return {
    subject,
    body: [
      `Hi${recruiterName},`,
      "",
      `I’m reaching out because ${input.companyName} looks focused on ${firstPainPoint}.`,
      `My background includes ${skills}, and I’ve worked on production systems where those strengths reduced delivery friction.`,
      "",
      "If that is a live priority for your team, I’d be glad to share a concise walkthrough of how I would approach it.",
      "",
      "Best,",
      name,
    ].join("\n"),
  };
}

export function fallbackLoomScript(input: {
  companyName: string;
  recruiter?: Record<string, any> | null;
  resume: ResumeStructuredData | Record<string, any>;
  painPoints: Array<Record<string, any>>;
}) {
  const name = candidateName(input.resume);
  const firstPainPoint = input.painPoints[0]?.title ?? `the current hiring priorities at ${input.companyName}`;
  const skills = Array.isArray(input.resume.skills) ? input.resume.skills.slice(0, 4).join(", ") : "product engineering";

  const hook = `Hi, I’m ${name}, and I recorded this because ${input.companyName} seems to be investing in ${firstPainPoint}.`;
  const problemStatement = `From the available job and company signals, the team likely needs faster execution and lower coordination drag around that area.`;
  const solutionPitch = `My background in ${skills} is relevant because I’ve shipped production work that removes that kind of bottleneck without inflating scope.`;
  const cta = "If that maps to a real team priority, I’d value a short conversation to compare notes.";

  return {
    hook,
    problemStatement,
    solutionPitch,
    cta,
    fullScript: [hook, problemStatement, solutionPitch, cta].join(" "),
  };
}
