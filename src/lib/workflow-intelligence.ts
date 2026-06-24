export type ResearchIntelligence = {
  products: string[];
  hiringSignals: string[];
  engineeringCultureNotes: string;
  fundingData: Record<string, unknown> | null;
  opportunities: string[];
  risks: string[];
  outreachAngles: string[];
  painPointCandidates: string[];
};

type ResearchRecord = {
  summary?: string | null;
  recent_news?: string | null;
  culture_notes?: string | null;
  tech_stack?: string[] | null;
  source_urls?: string[] | null;
  file_url?: string | null;
};

type PainPointRecord = {
  title: string;
  severity: number;
  description: string | null;
  source_url: string | null;
  tags?: string[] | null;
};

export type ParsedPainPoint = {
  narrative: string;
  evidence: string;
  suggestedSolution: string;
  category: string | null;
  signalSource: string | null;
};

const CODE_NOISE_PATTERNS = [
  /document\.documentElement/i,
  /localStorage\.getItem/i,
  /classList\./i,
  /window\.matchMedia/i,
  /data-theme/i,
  /function\s+[a-zA-Z_$][\w$]*\s*\(/i,
  /=>/,
];

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCodeNoise(value: string) {
  const normalized = normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
  if (!normalized) return false;
  const matchedSignals = CODE_NOISE_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  const symbolDensity =
    (normalized.match(/[{}()[\];]/g)?.length ?? 0) / Math.max(normalized.length, 1);
  return matchedSignals >= 2 || symbolDensity > 0.08;
}

function cleanText(value?: string | null, maxLength = 1200) {
  if (!value) return "";
  const units = value
    .replace(/<[^>]+>/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0 && !hasCodeNoise(part));
  return units.join(" ").slice(0, maxLength);
}

function cleanList(values: Array<string | null | undefined>, limit = 8) {
  return unique(values.map((value) => cleanText(value, 220))).slice(0, limit);
}

function safeObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseStoredJson(value?: string | null) {
  if (!value?.trim()) return {};
  try {
    return safeObject(JSON.parse(value));
  } catch {
    return {};
  }
}

export function parseResearchIntelligence(
  record: ResearchRecord,
  painPoints: PainPointRecord[] = [],
): ResearchIntelligence {
  const stored = parseStoredJson(record.file_url);
  const sections = (record.culture_notes ?? "")
    .split(/\n{2,}/)
    .map((section) => cleanText(section, 400))
    .filter(Boolean);

  const products =
    Array.isArray(stored.products) && stored.products.length
      ? cleanList(stored.products as string[], 8)
      : cleanList(
          sections
            .filter((section) => section.startsWith("Products:"))
            .flatMap((section) => section.replace(/^Products:\s*/i, "").split(",")),
          8,
        );

  const hiringSignals =
    Array.isArray(stored.hiringSignals) && stored.hiringSignals.length
      ? cleanList(stored.hiringSignals as string[], 8)
      : cleanList(
          sections
            .filter((section) => section.startsWith("Hiring signals:"))
            .flatMap((section) => section.replace(/^Hiring signals:\s*/i, "").split(/[;,]/)),
          8,
        );

  const engineeringCultureNotes =
    typeof stored.engineeringCultureNotes === "string" &&
    cleanText(stored.engineeringCultureNotes, 800)
      ? cleanText(stored.engineeringCultureNotes, 800)
      : (sections.find((section) => !/^(Products|Hiring signals|Funding):/i.test(section)) ?? "");

  const fundingData =
    safeObject(
      stored.fundingData && typeof stored.fundingData === "object" ? stored.fundingData : null,
    ) || safeObject(undefined);

  const parsedPainPoints = painPoints.map((point) => ({
    point,
    parsed: parsePainPoint(point.description, point.tags, point.source_url),
  }));

  const opportunities = unique(
    [
      ...products.map((product) => `Position experience around ${product}.`),
      ...hiringSignals.map((signal) => `Lead with proof tied to ${signal}.`),
      ...parsedPainPoints.map(({ parsed }) => parsed.suggestedSolution),
    ].map((value) => cleanText(value, 220)),
  ).slice(0, 6);

  const risks = unique(
    [
      ...parsedPainPoints
        .filter(({ point }) => point.severity >= 4)
        .map(({ point }) => `${point.title} is currently a high-severity issue.`),
      !record.recent_news?.trim() ? "Recent public-company signals are limited." : null,
      !record.source_urls?.length ? "Research is relying on thin source coverage." : null,
    ].map((value) => cleanText(value, 220)),
  ).slice(0, 6);

  const outreachAngles = unique(
    [
      ...parsedPainPoints.map(({ parsed }) => parsed.suggestedSolution),
      ...hiringSignals.map((signal) => `Reference ${signal} and reduce ramp time.`),
      engineeringCultureNotes
        ? `Mirror the engineering culture notes: ${engineeringCultureNotes}`
        : null,
    ].map((value) => cleanText(value, 260)),
  ).slice(0, 6);

  return {
    products,
    hiringSignals,
    engineeringCultureNotes: cleanText(engineeringCultureNotes, 800),
    fundingData: Object.keys(fundingData).length ? fundingData : null,
    opportunities,
    risks,
    outreachAngles,
    painPointCandidates: cleanList(
      painPoints.map((point) => point.title),
      6,
    ),
  };
}

export function parsePainPoint(
  description?: string | null,
  tags?: string[] | null,
  sourceUrl?: string | null,
): ParsedPainPoint {
  const raw = description ?? "";
  const [narrativePart, evidencePart = ""] = raw.split(/\n\nEvidence:\s*/i);
  const [evidence, suggestedSolution = ""] = evidencePart.split(/\n\nSuggested solution:\s*/i);
  return {
    narrative: cleanText(narrativePart, 500),
    evidence: cleanText(evidence, 400),
    suggestedSolution: cleanText(suggestedSolution, 400),
    category: tags?.[0] ?? null,
    signalSource: cleanText(sourceUrl ?? tags?.[1] ?? "", 200) || null,
  };
}

export function parseCampaignTemplate(value?: string | null) {
  return parseStoredJson(value);
}

export function lineDelta(source: string, target: string) {
  const sourceLines = unique(source.split(/\r?\n/));
  const targetLines = unique(target.split(/\r?\n/));
  return {
    added: targetLines.filter((line) => line && !sourceLines.includes(line)).slice(0, 12),
    removed: sourceLines.filter((line) => line && !targetLines.includes(line)).slice(0, 12),
  };
}
