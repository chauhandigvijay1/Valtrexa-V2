/**
 * Shared job-metadata normalization used by both the synchronous import path
 * (`api/[...route].ts`) and the job-import worker. Kept here to avoid
 * duplicating the inference logic.
 */

import { dedupeRoles, expandRoleVariants } from "../role-taxonomy.js";
import type { ImportedJob } from "../job-sources.js";
import { extractSalaries } from "../salary-parser.js";

function chooseText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    if (normalized) return normalized;
  }
  return null;
}

export function inferWorkMode(location: string | null, description: string) {
  const text = `${location ?? ""} ${description}`.toLowerCase();
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("remote")) return "remote";
  if (text.includes("onsite") || text.includes("on-site")) return "onsite";
  return null;
}

export function inferExperienceLevel(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  if (/intern|fresher|entry.level|entry-level|graduate|new grad/.test(text)) return "Fresher";
  if (/0.?1 year|0-1 year|0 to 1 year/.test(text)) return "0-1 Years";
  if (/1.?2 year|1-2 year|1 to 2 year/.test(text)) return "1-2 Years";
  if (/2.?3 year|2-3 year|2 to 3 year/.test(text)) return "2-3 Years";
  if (/3.?5 year|3-5 year|3 to 5 year|mid level/.test(text)) return "3-5 Years";
  if (/5\+ year|senior|staff|principal|lead/.test(text)) return "5+ Years";
  return null;
}

export function inferSalaryBounds(text: string) {
  const match = text.match(
    /(?:\$|usd\s*)?(\d{2,3})(?:k)?\s*(?:-|to)\s*(?:\$|usd\s*)?(\d{2,3})(?:k)?/i,
  );
  if (!match) return { salaryMin: null, salaryMax: null };
  const min = Number(match[1]);
  const max = Number(match[2]);
  const normalize = (value: number) => (value < 1000 ? value * 1000 : value);
  return { salaryMin: normalize(min), salaryMax: normalize(max) };
}

export function inferSalaryBoundsV2(
  title: string,
  description: string,
  location: string | null,
) {
  const { salary_min, salary_max } = extractSalaries(title, description, location);
  return { salaryMin: salary_min, salaryMax: salary_max };
}

export function inferCompanySize(description: string) {
  const text = description.toLowerCase();
  if (/startup|seed|series a|series b|small team/.test(text)) return "startup";
  if (/mid.?size|growing team|scale-up/.test(text)) return "mid";
  if (/enterprise|fortune 500|global company|large team/.test(text)) return "enterprise";
  return null;
}

export function inferFreshnessBucket(postedAt: string | null) {
  if (!postedAt) return null;
  const posted = new Date(postedAt).getTime();
  if (!Number.isFinite(posted)) return null;
  const days = Math.floor((Date.now() - posted) / 86400000);
  if (days <= 1) return "24h";
  if (days <= 3) return "3d";
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return "older";
}

export function buildJobMetadata(job: ImportedJob) {
  const description = chooseText(job.description, "") ?? "";
  return {
    normalized_roles: dedupeRoles(expandRoleVariants(job.title)),
    experience_level: inferExperienceLevel(job.title, description),
    work_mode: inferWorkMode(job.location, description),
    company_size: inferCompanySize(description),
    easy_apply:
      /easy apply|quick apply|one click/i.test(description) ||
      ["linkedin", "wellfound", "naukri"].includes(job.source),
    freshness_bucket: inferFreshnessBucket(job.postedAt),
    ...inferSalaryBoundsV2(job.title, description, job.location),
  };
}
