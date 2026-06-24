export type StrategicInputs = {
  hiringSignals?: string[];
  fundingData?: Record<string, unknown> | null;
  growthSignals?: Record<string, unknown> | string[] | null;
  openJobCount?: number;
  recruiterDensity?: number;
  techStack?: string[];
  recentNews?: string | null;
  companyResearch?: { summary?: string | null } | null;
  painPoints?: Array<{ severity?: number | null }>;
  companyQualityScore?: number | null;
  hiringVelocity?: number;
  engineeringMaturity?: number;
  remoteFriendliness?: number;
  productMomentum?: number;
};

export type StrategicResult = {
  strategicValueScore: number;
  valueTier: "LOW" | "MEDIUM" | "HIGH" | "ELITE";
  companyQualityScore: number;
  priorityScore: number;
  priorityTier: "LOW" | "MEDIUM" | "HIGH" | "ELITE";
  breakdown: Record<string, number>;
};

const clampInt = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function fundingScore(data?: Record<string, unknown> | null): number {
  if (!data) return 50;
  const status = String(data.status ?? data.funding_status ?? "").toLowerCase();
  if (/ipo|acquired|public/.test(status)) return 95;
  if (/series [cd-e]/.test(status)) return 90;
  if (/series b/.test(status)) return 80;
  if (/series a/.test(status)) return 70;
  if (/seed/.test(status)) return 60;
  const amount = Number(data.amount ?? data.last_round_amount ?? 0);
  if (amount >= 100_000_000) return 92;
  if (amount >= 25_000_000) return 80;
  if (amount >= 5_000_000) return 68;
  if (amount > 0) return 58;
  return 50;
}

function growthScore(input: StrategicInputs): number {
  const growth = input.growthSignals;
  if (Array.isArray(growth)) return clampInt(50 + growth.length * 8);
  if (growth && typeof growth === "object") {
    const keys = Object.keys(growth).length;
    return clampInt(50 + keys * 7);
  }
  return 50;
}

function hiringSignalScore(signals: string[] | undefined, openJobs: number): number {
  const fromSignals = Math.min(40, (signals?.length ?? 0) * 8);
  const fromJobs = openJobs >= 25 ? 60 : openJobs * 2.4;
  return clampInt(fromSignals + fromJobs);
}

function techStackScore(stack: string[] | undefined): number {
  if (!stack?.length) return 50;
  const modern = new Set([
    "react",
    "next.js",
    "typescript",
    "node.js",
    "go",
    "rust",
    "kubernetes",
    "graphql",
    "aws",
    "gcp",
    "azure",
    "supabase",
    "postgres",
    "redis",
    "vercel",
    "tailwind",
    "playwright",
    "vite",
    "docker",
    "terraform",
  ]);
  const hits = stack.filter((s) => modern.has(lower(s))).length;
  return clampInt(50 + (hits / Math.max(1, stack.length)) * 50);
}

function newsScore(news: string | null | undefined): number {
  if (!news || !news.trim()) return 50;
  const negative = /(layoff|lawsuit|fraud|bankrupt|downsiz|scandal)/i.test(news) ? -25 : 0;
  const positive = /(rais|fund|launch|acqui|growth|hiring|expand|partnership|series [a-e])/i.test(
    news,
  )
    ? 20
    : 0;
  return clampInt(60 + positive + negative);
}

function painPointScore(painPoints: Array<{ severity?: number | null }> | undefined): number {
  if (!painPoints?.length) return 55;
  const totalSeverity = painPoints.reduce((sum, p) => sum + (Number(p.severity) || 3), 0);
  return clampInt(55 + Math.min(35, totalSeverity * 3));
}

function recruiterDensityScore(density: number | undefined): number {
  if (!density) return 40;
  return clampInt(40 + Math.min(60, density * 12));
}

function researchScore(research: { summary?: string | null } | null | undefined): number {
  if (!research?.summary) return 50;
  return clampInt(55 + Math.min(40, Math.floor(research.summary.length / 50)));
}

function engineeringMaturityScore(val: number | undefined): number {
  if (val == null) return 50;
  return clampInt(val);
}

function remoteFriendlinessScore(val: number | undefined): number {
  if (val == null) return 50;
  return clampInt(val);
}

function productMomentumScore(val: number | undefined): number {
  if (val == null) return 50;
  return clampInt(val);
}

function hiringVelocityScore(val: number | undefined): number {
  if (val == null) return 50;
  return clampInt(40 + Math.min(60, val * 10));
}

function lower(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase() : "";
}

function scoreFromCount(count: number, thresholds: number[], values: number[]): number {
  if (count <= thresholds[0]) return values[0];
  for (let i = 1; i < thresholds.length; i += 1) {
    if (count <= thresholds[i]) return values[i];
  }
  return values[values.length - 1];
}

function classifyTier(score: number): "LOW" | "MEDIUM" | "HIGH" | "ELITE" {
  if (score >= 85) return "ELITE";
  if (score >= 70) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export function computeStrategicValue(inputs: StrategicInputs): StrategicResult {
  const hiring = hiringSignalScore(inputs.hiringSignals, inputs.openJobCount ?? 0);
  const funding = fundingScore(inputs.fundingData ?? undefined);
  const growth = growthScore(inputs);
  const openJobs = scoreFromCount(inputs.openJobCount ?? 0, [0, 5, 15, 30], [40, 60, 75, 90, 100]);
  const recruiterDensity = recruiterDensityScore(inputs.recruiterDensity);
  const tech = techStackScore(inputs.techStack);
  const news = newsScore(inputs.recentNews);
  const research = researchScore(inputs.companyResearch);
  const pain = painPointScore(inputs.painPoints);
  const quality = inputs.companyQualityScore != null ? clampInt(inputs.companyQualityScore) : 60;
  const engMaturity = engineeringMaturityScore(inputs.engineeringMaturity);
  const remoteFriendly = remoteFriendlinessScore(inputs.remoteFriendliness);
  const productMomentum = productMomentumScore(inputs.productMomentum);
  const hiringVelocity = hiringVelocityScore(inputs.hiringVelocity);

  const breakdown = {
    hiringSignals: hiring,
    funding,
    growth,
    openJobs,
    recruiterDensity,
    techStack: tech,
    recentNews: news,
    companyResearch: research,
    painPoints: pain,
    companyQuality: quality,
    engineeringMaturity: engMaturity,
    remoteFriendliness: remoteFriendly,
    productMomentum,
    hiringVelocity,
  };

  const weights = {
    hiringSignals: 0.12,
    funding: 0.1,
    growth: 0.1,
    openJobs: 0.1,
    recruiterDensity: 0.06,
    techStack: 0.07,
    recentNews: 0.05,
    companyResearch: 0.06,
    painPoints: 0.06,
    companyQuality: 0.05,
    engineeringMaturity: 0.07,
    remoteFriendliness: 0.05,
    productMomentum: 0.06,
    hiringVelocity: 0.05,
  };

  const strategicValueScore = clampInt(
    Object.keys(weights).reduce(
      (sum, key) =>
        sum + (breakdown as Record<string, number>)[key] * weights[key as keyof typeof weights],
      0,
    ),
  );

  const companyQualityScore = clampInt(
    quality * 0.3 +
      engMaturity * 0.2 +
      tech * 0.15 +
      research * 0.15 +
      remoteFriendly * 0.1 +
      productMomentum * 0.1,
  );

  const priorityScore = clampInt(
    strategicValueScore * 0.4 +
      companyQualityScore * 0.2 +
      hiring * 0.1 +
      funding * 0.1 +
      pain * 0.1 +
      openJobs * 0.1,
  );

  const valueTier = classifyTier(strategicValueScore);
  const priorityTier = classifyTier(priorityScore);

  return {
    strategicValueScore,
    valueTier,
    companyQualityScore,
    priorityScore,
    priorityTier,
    breakdown,
  };
}

export async function computeStrategicValueWithAI(
  inputs: StrategicInputs,
  companyName: string,
  userId: string,
): Promise<StrategicResult> {
  const base = computeStrategicValue(inputs);

  const ambiguous =
    (!inputs.hiringSignals?.length && !inputs.openJobCount) ||
    (!inputs.fundingData && !inputs.recentNews) ||
    (inputs.techStack && inputs.techStack.length < 3);

  if (!ambiguous) return base;

  try {
    const { callOpenRouterJson } = await import("./openrouter.js");
    const inputText = `
Company: ${companyName}
Funding: ${JSON.stringify(inputs.fundingData ?? {})}
News: ${inputs.recentNews ?? "none"}
Tech Stack: ${(inputs.techStack ?? []).join(", ")}
Hiring Signals: ${(inputs.hiringSignals ?? []).join(", ")}
Open Jobs: ${inputs.openJobCount ?? 0}
Growth: ${JSON.stringify(inputs.growthSignals ?? {})}
Pain Points: ${(inputs.painPoints ?? []).length}
    `.trim();

    const result = await callOpenRouterJson<{
      assessment: string;
      strategicValueScore: number;
      companyQualityScore: number;
      priorityScore: number;
      fundingScore?: number;
      hiringVelocityScore?: number;
      engineeringMaturityScore?: number;
      remoteFriendlinessScore?: number;
      productMomentumScore?: number;
    }>(
      [
        {
          role: "system",
          content:
            "You are a company strategic value analyst. Rate companies 0-100 for job seekers based on: funding, growth signals, hiring velocity, tech stack maturity, engineering culture, remote friendliness, product momentum, and recent news. Return JSON with scores and an assessment string.",
        },
        { role: "user", content: inputText },
      ],
      "high_value_scoring_v3",
      {
        type: "object",
        properties: {
          assessment: { type: "string" },
          strategicValueScore: { type: "number" },
          companyQualityScore: { type: "number" },
          priorityScore: { type: "number" },
          fundingScore: { type: "number" },
          hiringVelocityScore: { type: "number" },
          engineeringMaturityScore: { type: "number" },
          remoteFriendlinessScore: { type: "number" },
          productMomentumScore: { type: "number" },
        },
        required: ["assessment", "strategicValueScore", "companyQualityScore", "priorityScore"],
      } as const,
      { userId },
    );

    const data = result.data;
    const aiStrategicValueScore = clampInt(data.strategicValueScore);
    const aiCompanyQualityScore = clampInt(data.companyQualityScore);
    const aiPriorityScore = clampInt(data.priorityScore);

    const hybridStrategicValueScore = clampInt(
      Math.round(base.strategicValueScore * 0.5 + aiStrategicValueScore * 0.5),
    );
    const hybridCompanyQualityScore = clampInt(
      Math.round(base.companyQualityScore * 0.5 + aiCompanyQualityScore * 0.5),
    );
    const hybridPriorityScore = clampInt(
      Math.round(base.priorityScore * 0.5 + aiPriorityScore * 0.5),
    );

    const breakdown: Record<string, number> = {
      ...base.breakdown,
      aiAdjustedQualitativeScore: aiStrategicValueScore,
      aiAdjustedQualityScore: aiCompanyQualityScore,
      aiAdjustedPriorityScore: aiPriorityScore,
      aiFundingScore: data.fundingScore ?? 50,
      aiHiringVelocityScore: data.hiringVelocityScore ?? 50,
      aiEngineeringMaturityScore: data.engineeringMaturityScore ?? 50,
      aiRemoteFriendlinessScore: data.remoteFriendlinessScore ?? 50,
      aiProductMomentumScore: data.productMomentumScore ?? 50,
    };

    return {
      strategicValueScore: hybridStrategicValueScore,
      valueTier: classifyTier(hybridStrategicValueScore),
      companyQualityScore: hybridCompanyQualityScore,
      priorityScore: hybridPriorityScore,
      priorityTier: classifyTier(hybridPriorityScore),
      breakdown,
    };
  } catch {
    return base;
  }
}
