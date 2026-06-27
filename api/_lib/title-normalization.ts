const CANONICAL_ROLES: Record<string, string[]> = {
  frontend_developer: [
    "frontend developer",
    "front end developer",
    "front-end developer",
    "frontend engineer",
    "front-end engineer",
    "front end engineer",
    "frontend web developer",
    "front end web developer",
    "front-end web developer",
    "ui engineer",
    "react developer",
    "ui developer",
    "web ui engineer",
    "web ui developer",
    "frontend software engineer",
    "frontend software developer",
    "senior frontend developer",
    "senior front end developer",
    "junior frontend developer",
    "react frontend developer",
    "frontend developer intern",
    "frontend engineer intern",
    "react engineer",
    "react js developer",
    "react ui developer",
    "next.js developer",
    "nextjs developer",
  ],
  backend_developer: [
    "backend developer",
    "back end developer",
    "back-end developer",
    "backend engineer",
    "back-end engineer",
    "back end engineer",
    "backend software engineer",
    "backend software developer",
    "server side developer",
    "server-side developer",
    "senior backend developer",
    "senior back end developer",
    "node.js developer",
    "node developer",
    "python backend developer",
    "java backend developer",
    "go backend developer",
    "rust backend developer",
  ],
  full_stack_developer: [
    "full stack developer",
    "full-stack developer",
    "fullstack developer",
    "full stack engineer",
    "full-stack engineer",
    "fullstack engineer",
    "full stack web developer",
    "full-stack web developer",
    "mern developer",
    "mern stack developer",
    "mean stack developer",
    "senior full stack developer",
    "full stack software engineer",
    "full stack software developer",
  ],
  software_developer: [
    "software developer",
    "software engineer",
    "software development engineer",
    "sde",
    "senior software developer",
    "senior software engineer",
    "junior software developer",
    "junior software engineer",
    "associate software engineer",
    "staff software engineer",
    "principal software engineer",
    "lead software engineer",
    "software engineer ii",
    "software engineer iii",
    "sde i",
    "sde ii",
    "sde iii",
    "sde 1",
    "sde 2",
    "sde 3",
    "graduate engineer",
    "graduate software engineer",
    "software developer intern",
    "software engineer intern",
    "sde intern",
    "software development engineer intern",
    "member of technical staff",
    "member technical staff",
    "mts",
    "software development intern",
    "application developer",
    "application engineer",
    "programmer analyst",
    "software programmer",
  ],
  web_developer: [
    "web developer",
    "web engineer",
    "web developer intern",
    "web engineer intern",
    "senior web developer",
    "junior web developer",
    "frontend web developer",
    "backend web developer",
  ],
  javascript_developer: [
    "javascript developer",
    "javascript engineer",
    "js developer",
    "typescript developer",
    "typescript engineer",
    "ts developer",
    "javascript full stack developer",
    "senior javascript developer",
  ],
  react_developer: [
    "react developer",
    "react engineer",
    "react js developer",
    "react native developer",
    "senior react developer",
    "react frontend developer",
    "react ui developer",
    "next.js developer",
    "nextjs developer",
  ],
  node_js_developer: [
    "node.js developer",
    "node developer",
    "nodejs developer",
    "node.js engineer",
    "node backend developer",
    "node.js full stack developer",
    "senior node.js developer",
    "express developer",
    "nestjs developer",
  ],
  data_scientist: [
    "data scientist",
    "data engineer",
    "data analyst",
    "machine learning engineer",
    "ml engineer",
    "ai engineer",
    "senior data scientist",
    "data science engineer",
    "mlops engineer",
    "deep learning engineer",
  ],
  devops_engineer: [
    "devops engineer",
    "devops developer",
    "site reliability engineer",
    "sre",
    "platform engineer",
    "infrastructure engineer",
    "cloud engineer",
    "senior devops engineer",
    "ci/cd engineer",
    "release engineer",
  ],
};

const CANONICAL_NAMES: Record<string, string> = {};
for (const [canonical, aliases] of Object.entries(CANONICAL_ROLES)) {
  for (const alias of aliases) {
    CANONICAL_NAMES[alias] = canonical;
  }
}

export function normalizeTitle(title: string | null | undefined): string {
  if (!title) return "";
  const lower = title
    .toLowerCase()
    .replace(/[^a-z0-9\s/.-]/g, "")
    .trim();
  return CANONICAL_NAMES[lower] ?? lower;
}

export function getCanonicalFamily(title: string | null | undefined): string {
  const normalized = normalizeTitle(title);
  for (const [family, aliases] of Object.entries(CANONICAL_ROLES)) {
    if (normalized === family || aliases.includes(normalized)) return family;
  }
  return normalized;
}

// Score how well resume roles match a job title (0-1)
export function scoreTitleMatch(
  resumePreferredRoles: string[],
  jobTitle: string | null | undefined,
  jobNormalizedRoles?: string[] | null,
): number {
  const jobCanonical = getCanonicalFamily(jobTitle);
  const jobRoles = (jobNormalizedRoles ?? []).map((r) => getCanonicalFamily(r));
  if (jobCanonical) jobRoles.push(jobCanonical);

  if (!jobRoles.length) return 0.5;

  const resumeFamilies = resumePreferredRoles.map((r) => getCanonicalFamily(r)).filter(Boolean);
  if (!resumeFamilies.length) return 0.5;

  for (const rf of resumeFamilies) {
    for (const jf of jobRoles) {
      if (rf === jf) return 1.0;
    }
  }
  return 0.3;
}
