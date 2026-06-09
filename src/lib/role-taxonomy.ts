export const ROLE_OPTIONS = [
  "Full Stack Developer",
  "Full-Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "React Developer",
  "Next.js Developer",
  "MERN Developer",
  "Software Engineer",
  "Web Developer",
  "Java Developer",
  "Node.js Developer",
  "TypeScript Developer",
  "JavaScript Developer",
  "Platform Engineer",
  "Product Engineer",
  "Application Developer",
] as const;

const ROLE_SYNONYMS: Record<string, string[]> = {
  "full stack developer": [
    "Full Stack Developer",
    "Full-Stack Developer",
    "Fullstack Developer",
    "MERN Developer",
    "Software Engineer",
    "Web Developer",
  ],
  "full-stack developer": [
    "Full Stack Developer",
    "Full-Stack Developer",
    "Fullstack Developer",
    "MERN Developer",
    "Software Engineer",
    "Web Developer",
  ],
  "frontend developer": [
    "Frontend Developer",
    "Front End Developer",
    "React Developer",
    "Next.js Developer",
    "Web Developer",
    "Software Engineer",
  ],
  "backend developer": [
    "Backend Developer",
    "Node.js Developer",
    "Java Developer",
    "Software Engineer",
    "Web Developer",
  ],
  "react developer": [
    "React Developer",
    "Frontend Developer",
    "Next.js Developer",
    "Software Engineer",
    "Web Developer",
  ],
  "next.js developer": [
    "Next.js Developer",
    "React Developer",
    "Frontend Developer",
    "Full Stack Developer",
    "Web Developer",
  ],
  "mern developer": [
    "MERN Developer",
    "Full Stack Developer",
    "Node.js Developer",
    "React Developer",
    "Web Developer",
  ],
  "software engineer": [
    "Software Engineer",
    "Full Stack Developer",
    "Frontend Developer",
    "Backend Developer",
    "Web Developer",
  ],
  "web developer": [
    "Web Developer",
    "Frontend Developer",
    "Full Stack Developer",
    "React Developer",
    "Software Engineer",
  ],
  "java developer": [
    "Java Developer",
    "Backend Developer",
    "Software Engineer",
    "Platform Engineer",
  ],
  "node.js developer": [
    "Node.js Developer",
    "Backend Developer",
    "Full Stack Developer",
    "MERN Developer",
    "Software Engineer",
  ],
};

function titleCaseRole(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[a-z]+\.[a-z]+$/i.test(part)) {
        return part
          .split(".")
          .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase())
          .join(".");
      }
      if (part.toUpperCase() === part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function normalizeRoleLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function expandRoleVariants(value: string) {
  const normalized = normalizeRoleLabel(value);
  const key = normalized.toLowerCase();
  const expanded = ROLE_SYNONYMS[key] ?? [titleCaseRole(normalized)];
  return Array.from(new Set(expanded.map(normalizeRoleLabel)));
}

export function dedupeRoles(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeRoleLabel(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function normalizeRoles(values: string[]) {
  return dedupeRoles(
    values.flatMap((value) => {
      const normalized = normalizeRoleLabel(value);
      if (!normalized) return [];
      return [normalized];
    }),
  );
}
