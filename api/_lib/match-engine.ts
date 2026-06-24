/**
 * A4 — Match Engine.
 *
 * Pure, side-effect-free scoring functions for candidate/job fit. Every factor
 * returns an integer 0-100 and the weighted blend also returns 0-100. The
 * decomposed scores are persisted on `job_matches` so the UI can render a
 * radar/breakdown chart and the Opportunity Radar can rank jobs.
 *
 * This module is designed to be unit-tested without a database or network.
 */

import type { ResumeStructuredData } from "./resume-parser.js";

export type MatchBreakdown = {
  skillsScore: number;
  roleScore: number;
  experienceScore: number;
  locationScore: number;
  salaryScore: number;
  freshnessScore: number;
  companyQualityScore: number;
  recruiterScore: number;
  score: number;
};

export type MatchWeights = {
  skills: number;
  role: number;
  experience: number;
  location: number;
  salary: number;
  freshness: number;
  companyQuality: number;
  recruiter: number;
};

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  skills: 0.32,
  role: 0.2,
  experience: 0.16,
  location: 0.1,
  salary: 0.07,
  freshness: 0.07,
  companyQuality: 0.05,
  recruiter: 0.03,
};

export type MatchInputs = {
  resume:
    | ResumeStructuredData
    | {
        skills?: string[];
        preferred_roles?: string[];
        preferred_locations?: string[];
        years_experience?: number | null;
        salary_expectation?: number | null;
      };
  job: {
    title: string;
    description: string;
    company_name?: string | null;
    location?: string | null;
    normalized_roles?: string[] | null;
    experience_level?: string | null;
    work_mode?: string | null;
    salary_min?: number | null;
    salary_max?: number | null;
    freshness_bucket?: string | null;
    easy_apply?: boolean | null;
  };
  companyQualityScore?: number | null;
  recruiterAvailable?: boolean;
};

const clampInt = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function lowerList(values: unknown): string[] {
  return Array.isArray(values) ? values.map((v) => lower(v)).filter(Boolean) : [];
}

function jaccardOverlap(
  a: string[],
  b: string[],
): { matched: string[]; missing: string[]; ratio: number } {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setB.size) return { matched: [], missing: [], ratio: 0.6 }; // neutral when job lists nothing
  let matched = 0;
  const matchedNames: string[] = [];
  for (const item of setA) {
    if (setB.has(item)) {
      matched += 1;
      matchedNames.push(item);
    }
  }
  const union = new Set([...setA, ...setB]).size || 1;
  const missing = [...setB].filter((x) => !setA.has(x));
  return {
    matched: matchedNames,
    missing,
    ratio: matched / setB.size || (matched ? matched / union : 0),
  };
}

const FRESHNESS_SCORE: Record<string, number> = {
  "24h": 100,
  "3d": 90,
  "7d": 75,
  "30d": 55,
  older: 35,
};

const EXPERIENCE_BAND_YEARS: Record<string, number> = {
  Fresher: 0,
  "0-1 Years": 1,
  "1-2 Years": 2,
  "2-3 Years": 3,
  "3-5 Years": 4,
  "5+ Years": 7,
};

export function scoreSkills(resumeSkills: string[], jobDescription: string): number {
  if (!resumeSkills.length || !jobDescription) return 50;
  const text = lower(jobDescription);
  let hits = 0;
  for (const skill of resumeSkills) {
    const s = lower(skill);
    if (!s) continue;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(text)) hits += 1;
  }
  // Coverage ratio of the candidate's skills against the JD, but reward breadth too.
  const coverage = hits / resumeSkills.length;
  return clampInt(coverage * 100);
}

export function scoreRole(candidateRoles: string[], jobRoles: string[], jobTitle: string): number {
  const roles = lowerList(jobRoles?.length ? jobRoles : [jobTitle]);
  if (!roles.length) return 50;
  const candidate = lowerList(candidateRoles);
  const { ratio } = jaccardOverlap(candidate, roles);
  return clampInt(ratio * 100);
}

export function scoreExperience(
  candidateYears: number | null | undefined,
  jobLevel: string | null | undefined,
): number {
  if (!jobLevel) return 60;
  const required = EXPERIENCE_BAND_YEARS[jobLevel] ?? 3;
  if (candidateYears == null || !Number.isFinite(candidateYears)) {
    return required === 0 ? 70 : 50;
  }
  if (required === 0) return candidateYears <= 2 ? 90 : 70;
  if (candidateYears >= required)
    return clampInt(85 + Math.min(15, (candidateYears - required) * 3));
  const deficit = required - candidateYears;
  return clampInt(Math.max(20, 90 - deficit * 18));
}

export function scoreLocation(
  candidateLocations: string[],
  jobLocation: string | null | undefined,
  workMode: string | null | undefined,
): number {
  if (lower(workMode) === "remote") return 95;
  if (!jobLocation) return 60;
  const job = lower(jobLocation);
  const prefs = lowerList(candidateLocations);
  if (!prefs.length) return 55;
  // Match if any candidate location keyword appears in the job location (or vice versa).
  for (const pref of prefs) {
    if (pref && (job.includes(pref) || pref.includes(job))) return 90;
  }
  // Remote-preferring candidates get partial credit for any job.
  if (prefs.some((p) => p.includes("remote"))) return 50;
  return 40;
}

export function scoreSalary(
  candidateExpectation: number | null | undefined,
  jobMin: number | null | undefined,
  jobMax: number | null | undefined,
): number {
  if (!candidateExpectation || !jobMax) return 60;
  if (candidateExpectation <= jobMax && (!jobMin || candidateExpectation >= jobMin * 0.8))
    return 95;
  if (candidateExpectation <= jobMax * 1.1) return 80;
  if (candidateExpectation <= jobMax * 1.25) return 60;
  return 35;
}

export function scoreFreshness(freshnessBucket: string | null | undefined): number {
  if (!freshnessBucket) return 55;
  return FRESHNESS_SCORE[freshnessBucket] ?? 55;
}

export function scoreCompanyQuality(companyQualityScore: number | null | undefined): number {
  if (companyQualityScore == null || !Number.isFinite(companyQualityScore)) return 60;
  return clampInt(companyQualityScore);
}

export function scoreRecruiter(recruiterAvailable: boolean | null | undefined): number {
  return recruiterAvailable ? 90 : 50;
}

export function computeMatchScore(
  inputs: MatchInputs,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): MatchBreakdown {
  const resume = inputs.resume as ResumeStructuredData & {
    years_experience?: number | null;
  };
  const job = inputs.job;

  const skillsScore = scoreSkills(resume.skills ?? [], job.description ?? "");
  const roleScore = scoreRole(resume.preferred_roles ?? [], job.normalized_roles ?? [], job.title);
  const experienceScore = scoreExperience(resume.years_experience ?? null, job.experience_level);
  const locationScore = scoreLocation(
    resume.preferred_locations ?? [],
    job.location,
    job.work_mode,
  );
  const salaryScore = scoreSalary(resume.salary_expectation, job.salary_min, job.salary_max);
  const freshnessScore = scoreFreshness(job.freshness_bucket);
  const companyQualityScore = scoreCompanyQuality(inputs.companyQualityScore);
  const recruiterScore = scoreRecruiter(inputs.recruiterAvailable);

  const total =
    skillsScore * weights.skills +
    roleScore * weights.role +
    experienceScore * weights.experience +
    locationScore * weights.location +
    salaryScore * weights.salary +
    freshnessScore * weights.freshness +
    companyQualityScore * weights.companyQuality +
    recruiterScore * weights.recruiter;

  return {
    skillsScore,
    roleScore,
    experienceScore,
    locationScore,
    salaryScore,
    freshnessScore,
    companyQualityScore,
    recruiterScore,
    score: clampInt(total),
  };
}
