import { supabaseAdmin } from "./supabase.js";
import type { ResumeStructuredData } from "./resume-parser.js";
import { isMissingSchemaError } from "./compat.js";
import { logger } from "./logger.js";
import { dedupeRoles, expandRoleVariants } from "./role-taxonomy.js";

export type CandidateBrain = {
  profile: Record<string, any>;
  baseProfile: Record<string, any>;
  memory: any[];
  skills: any[];
  projects: any[];
  education: any[];
  experiences: any[];
  certifications: any[];
};

function chooseText(...values: Array<string | null | undefined>) {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const expectedMatch = trimmed.match(/Expected\s+(\w+)\s+(\d{4})/i);
  if (expectedMatch) {
    const months: Record<string, string> = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    };
    const month = months[expectedMatch[1].toLowerCase()];
    if (month) return `${expectedMatch[2]}-${month}-01`;
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  return null;
}

function uniqueResumeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function deriveYearsExperience(parsed: ResumeStructuredData, existingYears?: number | null) {
  if (existingYears && existingYears > 0) return existingYears;
  for (const exp of parsed.experience) {
    if (exp.start_date) {
      const start = new Date(exp.start_date);
      if (!isNaN(start.getTime())) {
        const end = exp.is_current
          ? new Date()
          : exp.end_date
            ? new Date(exp.end_date)
            : new Date();
        if (!isNaN(end.getTime())) {
          return Math.max(1, Math.round((end.getTime() - start.getTime()) / (365.25 * 86400000)));
        }
      }
    }
  }
  return 0;
}

function inferRemotePreference(parsed: ResumeStructuredData, existingPreference?: string | null) {
  if (existingPreference) return existingPreference;
  const text = [
    parsed.summary,
    ...parsed.experience.map((e) => e.description ?? ""),
    ...parsed.projects.map((p) => p.summary ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  if (/remote/i.test(text)) return "remote";
  if (/hybrid/i.test(text)) return "hybrid";
  if (/onsite|on-site/i.test(text)) return "onsite";
  return null;
}

async function replaceUserRows(
  table: string,
  userId: string,
  rows: Record<string, unknown>[],
  conflictColumn?: string,
) {
  if (!rows.length) return;
  const withUser = rows.map((r) => ({ ...r, user_id: userId }));

  if (conflictColumn) {
    const { error } = await supabaseAdmin.from(table).upsert(withUser, {
      onConflict: `user_id,${conflictColumn}`,
      ignoreDuplicates: false,
    });
    if (error) logger.error(`[candidate-brain] upsert ${table} failed:`, error);
  } else {
    await supabaseAdmin.from(table).delete().eq("user_id", userId);
    for (const row of rows) {
      const insert = await supabaseAdmin.from(table).insert({ ...row, user_id: userId });
      if (insert.error) {
        if (isMissingSchemaError(insert.error)) {
          const { features, ...fallback } = row;
          const retry = await supabaseAdmin.from(table).insert({ ...fallback, user_id: userId });
          if (retry.error)
            logger.warn(`[candidate-brain] insert ${table} fallback failed:`, retry.error.message);
        } else {
          logger.warn(`[candidate-brain] insert ${table} failed:`, insert.error.message);
        }
      }
    }
  }
}

export async function getCandidateBrain(userId: string): Promise<CandidateBrain | null> {
  const [profile, baseProfile, memory, skills, projects, education, experiences, certifications] =
    await Promise.all([
      supabaseAdmin.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("candidate_memory").select("*").eq("user_id", userId),
      supabaseAdmin.from("skills").select("*").eq("user_id", userId),
      supabaseAdmin.from("projects").select("*").eq("user_id", userId),
      supabaseAdmin.from("education").select("*").eq("user_id", userId),
      supabaseAdmin.from("experiences").select("*").eq("user_id", userId),
      supabaseAdmin.from("certifications").select("*").eq("user_id", userId),
    ]);

  if (!profile.data && !baseProfile.data) return null;

  return {
    profile: profile.data || {},
    baseProfile: baseProfile.data || {},
    memory: memory.data || [],
    skills: skills.data || [],
    projects: projects.data || [],
    education: education.data || [],
    experiences: experiences.data || [],
    certifications: certifications.data || [],
  };
}

export async function getResumeForMatching(userId: string): Promise<{
  skills: string[];
  preferredRoles: string[];
  preferredLocations: string[];
  salaryExpectation: number | null;
  yearsExperience: number;
  location: string | null;
} | null> {
  const brain = await getCandidateBrain(userId);
  if (!brain) return null;

  const pr = brain.profile.parsed_resume as ResumeStructuredData | undefined;
  const skills: string[] = [...(pr?.skills ?? []), ...brain.skills.map((s: any) => s.name)];
  const dbLocations = brain.profile.preferred_locations ?? [];
  const parsedLocations = pr?.preferred_locations ?? [];

  return {
    skills: Array.from(new Set(skills.filter(Boolean))),
    preferredRoles: dedupeRoles([
      ...(brain.profile.preferred_roles ?? []),
      ...(pr?.preferred_roles ?? []),
    ]),
    preferredLocations: uniqueResumeStrings([
      ...dbLocations,
      ...parsedLocations,
      pr?.location ?? null,
    ]),
    salaryExpectation: brain.profile.salary_expectation ?? pr?.salary_expectation ?? null,
    yearsExperience: brain.profile.years_experience ?? 0,
    location: pr?.location ?? brain.baseProfile.location ?? null,
  };
}

export async function syncResumeToBrain(
  userId: string,
  parsed: ResumeStructuredData,
  rawText?: string,
) {
  const brain = await getCandidateBrain(userId);

  // Normalize parsed data — AI may omit empty arrays
  parsed.experience ??= [];
  parsed.projects ??= [];
  parsed.education ??= [];
  parsed.skills ??= [];
  parsed.certifications ??= [];
  const mergedRoles = dedupeRoles([
    ...(parsed.preferred_roles ?? []),
    ...((brain?.profile.preferred_roles as string[] | null) ?? []),
  ]);
  const expandedRoles = dedupeRoles(mergedRoles.flatMap((role) => expandRoleVariants(role)));

  const profilePayload = {
    user_id: userId,
    current_title: chooseText(parsed.experience[0]?.title, brain?.profile.current_title),
    current_company: chooseText(parsed.experience[0]?.company, brain?.profile.current_company),
    years_experience: deriveYearsExperience(parsed, brain?.profile.years_experience),
    github_url: chooseText(parsed.github_url, brain?.profile.github_url),
    linkedin_url: chooseText(parsed.linkedin_url, brain?.profile.linkedin_url),
    portfolio_url: chooseText(parsed.portfolio_url, brain?.profile.portfolio_url),
    career_goal: chooseText(parsed.career_goal, brain?.profile.career_goal),
    remote_preference: inferRemotePreference(parsed, brain?.profile.remote_preference),
    summary: chooseText(parsed.summary, brain?.profile.summary),
    communication_style: chooseText(parsed.communication_style, brain?.profile.communication_style),
    preferred_roles: mergedRoles.length ? mergedRoles : expandedRoles,
    preferred_locations: uniqueResumeStrings([
      ...(parsed.preferred_locations ?? []),
      parsed.location,
      ...((brain?.profile.preferred_locations as string[] | null) ?? []),
    ]),
    salary_expectation: parsed.salary_expectation ?? brain?.profile.salary_expectation ?? null,
    resume_raw_text: rawText ?? brain?.profile.resume_raw_text ?? null,
    parsed_resume: { ...parsed, preferred_roles_expanded: expandedRoles },
  };

  if (brain?.profile?.id) {
    await supabaseAdmin
      .from("candidate_profiles")
      .update(profilePayload)
      .eq("id", brain.profile.id);
  } else {
    await supabaseAdmin.from("candidate_profiles").insert(profilePayload as any);
  }

  const baseProfilePayload = {
    name: chooseText(parsed.name, brain?.baseProfile.name),
    email: chooseText(parsed.email, brain?.baseProfile.email),
    phone: chooseText(parsed.phone, brain?.baseProfile.phone),
    location: chooseText(parsed.location, brain?.baseProfile.location),
  };
  const profileUpdate = await supabaseAdmin
    .from("profiles")
    .update(baseProfilePayload as any)
    .eq("id", userId);
  if (profileUpdate.error && isMissingSchemaError(profileUpdate.error)) {
    const { phone: _phone, ...fallback } = baseProfilePayload;
    await supabaseAdmin
      .from("profiles")
      .update(fallback as any)
      .eq("id", userId);
  }

  await replaceUserRows(
    "skills",
    userId,
    buildSkillRows(parsed, rawText).map((s) => ({
      name: s.name,
      category: s.category,
      level: s.level,
    })),
    "name",
  );

  await replaceUserRows(
    "education",
    userId,
    parsed.education.map((edu) => ({
      school: chooseText(edu.school, "Unknown School"),
      degree: chooseText(edu.degree),
      field: chooseText(edu.field),
      start_date: normalizeDate(edu.start_date),
      end_date: normalizeDate(edu.end_date),
      description: chooseText(edu.description, edu.summary),
    })),
  );

  await replaceUserRows(
    "experiences",
    userId,
    parsed.experience.map((exp) => ({
      company: chooseText(exp.company, "Unknown Company"),
      title: chooseText(exp.title, "Title"),
      location: chooseText(exp.location),
      start_date: normalizeDate(exp.start_date),
      end_date: normalizeDate(exp.end_date),
      is_current: exp.is_current ?? false,
      description: chooseText(exp.description, exp.summary),
    })),
  );

  await replaceUserRows(
    "projects",
    userId,
    buildProjectRows(parsed, (brain?.projects as Array<Record<string, any>>) ?? []).map(
      (project) => ({
        name: project.name,
        description: project.description,
        github_url: project.github_url,
        live_url: project.live_url,
        tech_stack: project.tech_stack,
        features: project.features,
        impact: project.impact,
      }),
    ),
  );

  await replaceUserRows(
    "certifications",
    userId,
    parsed.certifications
      .filter((cert) => !!chooseText(cert.name))
      .map((cert) => ({
        name: chooseText(cert.name, "Certification"),
        issuer: chooseText(cert.issuer),
        date: chooseText(cert.date),
        summary: chooseText(cert.summary),
      })),
  );

  return { profilePayload, baseProfilePayload };
}

const SKILL_CATEGORY_LOOKUP: Record<string, string> = {
  typescript: "Languages",
  javascript: "Languages",
  python: "Languages",
  java: "Languages",
  go: "Languages",
  "c++": "Languages",
  "c#": "Languages",
  php: "Languages",
  ruby: "Languages",
  rust: "Languages",
  swift: "Languages",
  kotlin: "Languages",
  sql: "Languages",
  html: "Languages",
  css: "Languages",
  react: "Frameworks",
  "next.js": "Frameworks",
  vue: "Frameworks",
  angular: "Frameworks",
  "node.js": "Frameworks",
  express: "Frameworks",
  nestjs: "Frameworks",
  "spring boot": "Frameworks",
  django: "Frameworks",
  flask: "Frameworks",
  fastapi: "Frameworks",
  laravel: "Frameworks",
  ".net": "Frameworks",
  postgres: "Databases",
  postgresql: "Databases",
  mysql: "Databases",
  mongodb: "Databases",
  supabase: "Databases",
  redis: "Databases",
  sqlite: "Databases",
  dynamodb: "Databases",
  elasticsearch: "Databases",
  aws: "Cloud",
  azure: "Cloud",
  gcp: "Cloud",
  vercel: "Cloud",
  netlify: "Cloud",
  firebase: "Cloud",
  cloudflare: "Cloud",
  docker: "DevOps",
  kubernetes: "DevOps",
  terraform: "DevOps",
  linux: "DevOps",
  "github actions": "DevOps",
  "ci/cd": "DevOps",
  jenkins: "DevOps",
  git: "Tools",
  postman: "Tools",
  figma: "Tools",
  playwright: "Tools",
  vite: "Tools",
  jira: "Tools",
  webpack: "Tools",
  notion: "Tools",
  "tailwind css": "Libraries",
  graphql: "Libraries",
  redux: "Libraries",
  "tanstack query": "Libraries",
  bootstrap: "Libraries",
  pandas: "Libraries",
  numpy: "Libraries",
  tensorflow: "Libraries",
  pytorch: "Libraries",
  scikit: "Libraries",
  "scikit-learn": "Libraries",
  matplotlib: "Libraries",
  keras: "Libraries",
  huggingface: "Libraries",
  openai: "Libraries",
  langchain: "Libraries",
  jest: "Libraries",
  vitest: "Libraries",
  cypress: "Libraries",
  mocha: "Libraries",
  three: "Libraries",
  d3: "Libraries",
  sass: "Libraries",
  "material ui": "Libraries",
  prisma: "Libraries",
  typeorm: "Libraries",
  sequelize: "Libraries",
  mongoose: "Libraries",
  "ruby on rails": "Frameworks",
  "asp.net": "Frameworks",
  svelte: "Frameworks",
  "nuxt.js": "Frameworks",
  gatsby: "Frameworks",
  remix: "Frameworks",
  electron: "Frameworks",
  "react native": "Frameworks",
  flutter: "Frameworks",
  "express.js": "Frameworks",
  maria: "Databases",
  cassandra: "Databases",
  neo4j: "Databases",
  firestore: "Databases",
  bigquery: "Databases",
  snowflake: "Databases",
  clickhouse: "Databases",
  couchdb: "Databases",
  heroku: "Cloud",
  digitalocean: "Cloud",
  railway: "Cloud",
  render: "Cloud",
  ansible: "DevOps",
  puppet: "DevOps",
  chef: "DevOps",
  helm: "DevOps",
  prometheus: "DevOps",
  grafana: "DevOps",
  datadog: "DevOps",
  sentry: "DevOps",
  nginx: "DevOps",
  apache: "DevOps",
  eslint: "Tools",
  prettier: "Tools",
  yarn: "Tools",
  pnpm: "Tools",
  npm: "Tools",
  babel: "Tools",
  rollup: "Tools",
  turborepo: "Tools",
  nx: "Tools",
  storybook: "Tools",
  linear: "Tools",
  scala: "Languages",
  r: "Languages",
  dart: "Languages",
  perl: "Languages",
  shell: "Languages",
  bash: "Languages",
  zig: "Languages",
  leadership: "Soft Skills",
  communication: "Soft Skills",
  teamwork: "Soft Skills",
  collaboration: "Soft Skills",
  "problem solving": "Soft Skills",
  "critical thinking": "Soft Skills",
  "time management": "Soft Skills",
  management: "Soft Skills",
  mentoring: "Soft Skills",
  presentation: "Soft Skills",
  negotiation: "Soft Skills",
  "conflict resolution": "Soft Skills",
  adaptability: "Soft Skills",
  creativity: "Soft Skills",
  "emotional intelligence": "Soft Skills",
  empathy: "Soft Skills",
  "public speaking": "Soft Skills",
  writing: "Soft Skills",
  documentation: "Soft Skills",
  agile: "Soft Skills",
  scrum: "Soft Skills",
};

function categorizeSkill(name: string) {
  return SKILL_CATEGORY_LOOKUP[name.toLowerCase()] ?? "General";
}

function inferSkillLevel(name: string, parsed: ResumeStructuredData, rawText = "") {
  const normalized = name.toLowerCase();
  const hits =
    parsed.projects.filter((project) =>
      (project.tech_stack ?? []).some((item) => item.toLowerCase() === normalized),
    ).length +
    parsed.experience.filter((experience) =>
      `${experience.title ?? ""} ${experience.description ?? ""} ${experience.summary ?? ""}`
        .toLowerCase()
        .includes(normalized),
    ).length +
    (rawText.toLowerCase().match(new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))
      ?.length ?? 0);

  if (hits >= 6) return "expert";
  if (hits >= 4) return "advanced";
  if (hits >= 2) return "intermediate";
  return "beginner";
}

function buildSkillRows(parsed: ResumeStructuredData, rawText = "") {
  const collected = uniqueResumeStrings([
    ...parsed.skills,
    ...parsed.projects.flatMap((project) => project.tech_stack ?? []),
  ]);

  return collected.map((name) => ({
    name,
    category: categorizeSkill(name),
    level: inferSkillLevel(name, parsed, rawText),
  }));
}

function buildProjectRows(
  parsed: ResumeStructuredData,
  existingProjects: Array<Record<string, any>>,
) {
  const existingByName = new Map(
    existingProjects
      .filter((project) => typeof project.name === "string")
      .map((project) => [String(project.name).toLowerCase(), project]),
  );

  return parsed.projects
    .map((project) => {
      const fallback = project.name ? existingByName.get(project.name.toLowerCase()) : null;
      const features = uniqueResumeStrings([
        ...(project.features ?? []),
        ...(fallback?.features ?? []),
      ]);
      return {
        name: chooseText(project.name, fallback?.name, "Project"),
        description: chooseText(project.description, project.summary, fallback?.description),
        github_url: chooseText(project.github_url, fallback?.github_url),
        live_url: chooseText(project.live_url, fallback?.live_url),
        tech_stack: uniqueResumeStrings([
          ...(project.tech_stack ?? []),
          ...(fallback?.tech_stack ?? []),
        ]),
        features,
        impact: chooseText(features.join("; "), fallback?.impact),
      };
    })
    .filter((project) => !!project.name);
}
