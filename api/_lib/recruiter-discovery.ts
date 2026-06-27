import { callOpenRouterJson } from "./openrouter.js";

export type EmailSource =
  | "website"
  | "contact_page"
  | "careers_page"
  | "linkedin"
  | "hunter_pattern"
  | "manual"
  | "ai_discovery"
  | "fallback";

export type DiscoveredContact = {
  name: string;
  title: string;
  role: "Recruiter" | "Hiring Manager" | "Engineering Manager" | "Founder";
  department?: string;
  profile_url: string | null;
  email: string | null;
  email_verified: boolean;
  email_source: EmailSource | null;
  linkedin_url: string | null;
  reason: string;
  searchQuery: string;
  source: string;
  source_url?: string | null;
  source_metadata?: Record<string, any>;
  confidence_score: number;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isPlausibleName(name: string): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  if (/(team|careers|hr@|recruiting|talent acquisition desk|support|info@|admin)/i.test(trimmed)) {
    return false;
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.length >= 2 && trimmed.length <= 80;
}

export function isPlausibleEmail(email: string | null | undefined): email is string {
  return typeof email === "string" && EMAIL_SHAPE.test(email.trim());
}

const EMAIL_SOURCE_BONUS: Record<string, number> = {
  website: 0.15,
  contact_page: 0.18,
  careers_page: 0.12,
  linkedin: 0.1,
  hunter_pattern: 0.05,
  manual: 0.08,
  ai_discovery: 0.03,
  fallback: 0,
};

export function scoreContact(input: {
  name: string;
  role: string;
  requestedRole: string;
  profileUrl: string | null;
  email: string | null;
  email_source?: string | null;
  source: string;
}): number {
  let score = 0.1;
  if (
    input.profileUrl &&
    /^https?:\/\/([a-z0-9-]+\.)?(linkedin\.com|(([\w-]+\.)?))(in\/|company\/)/i.test(
      input.profileUrl,
    )
  ) {
    score += 0.45;
  } else if (input.profileUrl && /^https?:\/\//i.test(input.profileUrl)) {
    score += 0.25;
  }
  if (
    input.role &&
    input.requestedRole &&
    input.role.toLowerCase().includes(input.requestedRole.toLowerCase())
  ) {
    score += 0.25;
  } else if (input.role) {
    score += 0.1;
  }
  if (/greenhouse|lever|ashby|workable|official|company|careers|team/i.test(input.source))
    score += 0.15;
  if (isPlausibleName(input.name)) score += 0.1;
  if (isPlausibleEmail(input.email)) {
    score += 0.05;
    score += EMAIL_SOURCE_BONUS[input.email_source ?? ""] ?? 0;
  }
  return Math.min(0.97, Number(score.toFixed(2)));
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 VALTREXA-V2/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function extractEmailsFromHtml(html: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = html.match(emailRegex);
  if (!matches) return [];
  return [...new Set(matches)].filter((e) => {
    const domain = e.split("@")[1]?.toLowerCase();
    return domain && !/example\.com|test\.com|domain\.com|yourdomain/i.test(domain);
  });
}

function extractNamesFromHtml(html: string, $: any): string[] {
  const names: string[] = [];
  const $c = $;

  $c("h1, h2, h3, h4, .name, .member-name, [class*=name], [class*=title]").each(
    (_i: number, el: any) => {
      const text = $c(el).text().replace(/\s+/g, " ").trim();
      if (isPlausibleName(text) && text.split(/\s+/).length >= 2) {
        names.push(text);
      }
    },
  );

  $c("a[href*='linkedin']").each((_i: number, el: any) => {
    const text = $c(el).text().replace(/\s+/g, " ").trim();
    if (isPlausibleName(text) && text.split(/\s+/).length >= 2) {
      names.push(text);
    }
  });

  return [...new Set(names)];
}

export async function scrapeCompanyTeamPage(companyUrl: string): Promise<{
  teamMembers: Array<{
    name: string;
    title: string;
    email: string | null;
    linkedin: string | null;
  }>;
  emails: string[];
}> {
  const teamUrls = [
    `${companyUrl.replace(/\/$/, "")}/team`,
    `${companyUrl.replace(/\/$/, "")}/about`,
    `${companyUrl.replace(/\/$/, "")}/company/team`,
    `${companyUrl.replace(/\/$/, "")}/people`,
    `${companyUrl.replace(/\/$/, "")}/about-us`,
    `${companyUrl.replace(/\/$/, "")}/leadership`,
  ];

  const teamMembers: Array<{
    name: string;
    title: string;
    email: string | null;
    linkedin: string | null;
  }> = [];
  const allEmails: string[] = [];

  for (const url of teamUrls) {
    const html = await fetchHtml(url);
    if (!html) continue;

    try {
      const { load } = await import("cheerio");
      const $ = load(html);

      const emails = extractEmailsFromHtml(html);
      allEmails.push(...emails);

      const names = extractNamesFromHtml(html, $);
      for (const name of names) {
        const titleEl = $(`*:contains("${name}")`).first();
        let title = "";
        titleEl
          .parent()
          .find("p, span, .title, [class*=title]")
          .each((_i: number, el: any) => {
            const t = $(el).text().replace(/\s+/g, " ").trim();
            if (t && t !== name && t.length < 100) title = t;
          });

        const linkedinUrl = $(`a[href*='linkedin.com/in/']`).first().attr("href") || null;
        const relatedEmail =
          emails.find((e) => e.toLowerCase().includes(name.split(" ")[0]?.toLowerCase() ?? "")) ||
          null;

        if (!teamMembers.some((m) => m.name === name)) {
          teamMembers.push({ name, title, email: relatedEmail, linkedin: linkedinUrl });
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback: try getting emails from the contact page too
  const contactEmails = await scrapeCompanyContactPage(companyUrl);
  allEmails.push(...contactEmails);

  return { teamMembers, emails: [...new Set(allEmails)] };
}

export async function scrapeCompanyContactPage(companyUrl: string): Promise<string[]> {
  const contactUrls = [
    `${companyUrl.replace(/\/$/, "")}/contact`,
    `${companyUrl.replace(/\/$/, "")}/contact-us`,
    `${companyUrl.replace(/\/$/, "")}/support`,
  ];
  const allEmails: string[] = [];
  for (const url of contactUrls) {
    const html = await fetchHtml(url);
    if (html) {
      allEmails.push(...extractEmailsFromHtml(html));
    }
  }
  return [...new Set(allEmails)];
}

export async function scrapeCompanyCareersPage(companyUrl: string): Promise<{
  teamMembers: Array<{
    name: string;
    title: string;
    email: string | null;
    linkedin: string | null;
  }>;
  emails: string[];
}> {
  const careersUrls = [
    `${companyUrl.replace(/\/$/, "")}/careers`,
    `${companyUrl.replace(/\/$/, "")}/jobs`,
    `${companyUrl.replace(/\/$/, "")}/careers/openings`,
  ];
  const teamMembers: Array<{
    name: string;
    title: string;
    email: string | null;
    linkedin: string | null;
  }> = [];
  const allEmails: string[] = [];

  for (const url of careersUrls) {
    const html = await fetchHtml(url);
    if (!html) continue;
    try {
      const { load } = await import("cheerio");
      const $ = load(html);
      const emails = extractEmailsFromHtml(html);
      allEmails.push(...emails);

      $("h1, h2, h3, h4, .name, [class*=name], a[href*='linkedin']").each((_i: number, el: any) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (isPlausibleName(text) && text.split(/\s+/).length >= 2) {
          const href = $(el).attr("href") || "";
          const linkedinUrl: string | null = href.includes("linkedin.com") ? href : null;
          if (!teamMembers.some((m) => m.name === text)) {
            teamMembers.push({ name: text, title: "", email: null, linkedin: linkedinUrl });
          }
        }
      });
    } catch {
      continue;
    }
  }

  return { teamMembers, emails: [...new Set(allEmails)] };
}

export function generateHunterPatterns(name: string, companyDomain: string): string[] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || !companyDomain) return [];
  const first = parts[0].toLowerCase();
  const last = parts[parts.length - 1].toLowerCase();
  const fi = first[0];
  const li = last[0];
  const patterns = new Set<string>();

  const candidates = [
    `${first}.${last}`,
    `${first}${last}`,
    `${fi}${last}`,
    `${first}.${li}`,
    `${first}_${last}`,
    `${fi}.${last}`,
    `${last}.${first}`,
    `${first}`,
    `${first}-${last}`,
  ];

  for (const p of candidates) {
    patterns.add(`${p}@${companyDomain}`);
    patterns.add(`${p}@${companyDomain.replace(/^www\./, "")}`);
  }

  return [...patterns];
}

export function classifyTeamMemberRole(
  title: string,
): "Recruiter" | "Hiring Manager" | "Engineering Manager" | "Founder" {
  const lower = title.toLowerCase();
  if (/founder|co-founder|ceo/i.test(lower)) return "Founder";
  if (/talent acqui|recruiter|sourcer|recruiting|people ops|hr\b|head of people/i.test(lower))
    return "Recruiter";
  if (/hiring manager|hiring lead|staffing|workforce/i.test(lower)) return "Hiring Manager";
  if (/engineering manager|em\b|vp eng|director of engineering|tech lead|cto/i.test(lower))
    return "Engineering Manager";
  if (/manager|director|head of|lead/i.test(lower)) return "Hiring Manager";
  return "Recruiter";
}

export async function discoverContactsForCompany(input: {
  companyName: string;
  companyUrl?: string;
  companyDomain?: string;
  roleTitle: string;
  userId: string;
}): Promise<DiscoveredContact[]> {
  const contacts: DiscoveredContact[] = [];
  const allEmails: string[] = [];

  if (input.companyUrl) {
    // 1. Team page scraping
    const scraped = await scrapeCompanyTeamPage(input.companyUrl);
    allEmails.push(...scraped.emails);

    for (const member of scraped.teamMembers) {
      const role = classifyTeamMemberRole(member.title);
      const email = member.email && isPlausibleEmail(member.email) ? member.email.trim() : null;
      contacts.push({
        name: member.name,
        title: member.title,
        role,
        profile_url: member.linkedin,
        email,
        email_verified: !!email,
        email_source: email ? ("website" as EmailSource) : null,
        linkedin_url: member.linkedin,
        reason: `Found on company team/about page`,
        searchQuery: `"${input.companyName}" ${input.roleTitle || "recruiter"}`,
        source: "company_website",
        confidence_score: scoreContact({
          name: member.name,
          role,
          requestedRole: input.roleTitle,
          profileUrl: member.linkedin,
          email,
          email_source: email ? "website" : null,
          source: "company_website",
        }),
      });
    }

    // 2. Careers page scraping (extract hiring team from job postings)
    const careersData = await scrapeCompanyCareersPage(input.companyUrl);
    allEmails.push(...careersData.emails);
    for (const member of careersData.teamMembers) {
      if (!contacts.some((c) => c.name.toLowerCase() === member.name.toLowerCase())) {
        const role = classifyTeamMemberRole(member.title || "Hiring Manager");
        const email = member.email && isPlausibleEmail(member.email) ? member.email.trim() : null;
        contacts.push({
          name: member.name,
          title: member.title || "Hiring Team",
          role,
          profile_url: member.linkedin,
          email,
          email_verified: !!email,
          email_source: email ? ("careers_page" as EmailSource) : null,
          linkedin_url: member.linkedin,
          reason: `Found on company careers page`,
          searchQuery: `"${input.companyName}" ${input.roleTitle || "recruiter"}`,
          source: "careers_page",
          confidence_score: scoreContact({
            name: member.name,
            role,
            requestedRole: input.roleTitle,
            profileUrl: member.linkedin,
            email,
            email_source: email ? "careers_page" : null,
            source: "careers_page",
          }),
        });
      }
    }

    // 3. Generate Hunter.io email patterns for discovered contacts
    if (input.companyDomain) {
      for (const contact of contacts) {
        if (!contact.email && isPlausibleName(contact.name)) {
          const patterns = generateHunterPatterns(contact.name, input.companyDomain);
          if (patterns.length > 0) {
            contact.email = patterns[0];
            contact.email_verified = false;
            contact.email_source = "hunter_pattern" as EmailSource;
          }
        }
      }
    }
  }

  // 4. AI discovery
  const aiContacts = await discoverContactsViaAI({
    companyName: input.companyName,
    roleTitle: input.roleTitle,
    context: { existingContacts: contacts },
    userId: input.userId,
  });

  const seen = new Set(contacts.map((c) => c.name.toLowerCase()));
  for (const ac of aiContacts) {
    if (!seen.has(ac.name.toLowerCase())) {
      const hasEmailFromSite = allEmails.find((e) =>
        e.toLowerCase().includes(ac.name.split(" ")[0]?.toLowerCase() ?? ""),
      );
      if (hasEmailFromSite && !ac.email) {
        ac.email = hasEmailFromSite;
        ac.email_verified = true;
        ac.email_source = "website";
      }
      contacts.push(ac);
      seen.add(ac.name.toLowerCase());
    }
  }

  // 5. Deduplicate by merging same-name contacts
  const merged = new Map<string, DiscoveredContact>();
  for (const c of contacts) {
    const key = c.name.toLowerCase();
    if (merged.has(key)) {
      const existing = merged.get(key)!;
      if (c.email && !existing.email) {
        existing.email = c.email;
        existing.email_verified = c.email_verified;
        existing.email_source = c.email_source;
      }
      if (c.linkedin_url && !existing.linkedin_url) existing.linkedin_url = c.linkedin_url;
      if (c.profile_url && !existing.profile_url) existing.profile_url = c.profile_url;
      if (c.title && !existing.title) existing.title = c.title;
      if (c.confidence_score > existing.confidence_score) {
        Object.assign(existing, c);
      }
    } else {
      merged.set(key, { ...c });
    }
  }

  return [...merged.values()];
}

const discoverySchema = {
  type: "object",
  properties: {
    contacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          role: {
            type: "string",
            enum: ["Recruiter", "Hiring Manager", "Engineering Manager", "Founder"],
          },
          profile_url: { type: ["string", "null"] },
          linkedin_url: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          reason: { type: "string" },
          searchQuery: { type: "string" },
        },
        required: [
          "name",
          "title",
          "role",
          "profile_url",
          "linkedin_url",
          "email",
          "reason",
          "searchQuery",
        ],
      },
    },
  },
  required: ["contacts"],
} as const;

export async function discoverContactsViaAI(input: {
  companyName: string;
  roleTitle: string;
  context: { research?: unknown; existingContacts?: unknown[] };
  userId: string;
}): Promise<DiscoveredContact[]> {
  const result = await callOpenRouterJson<{
    contacts: Array<Omit<DiscoveredContact, "confidence_score" | "email_verified" | "source">>;
  }>(
    [
      {
        role: "system",
        content:
          "You are a recruiter discovery engine. Use ONLY verified information from the provided research and context. " +
          "NEVER fabricate names, profile URLs, or emails. If an email is not verifiable from the context, return null. " +
          "Prefer LinkedIn profile URLs (https://linkedin.com/in/...) when available. " +
          "Return realistic human names only — never generic team mailboxes as a person name. " +
          "Return strict JSON.",
      },
      {
        role: "user",
        content:
          `Company: ${input.companyName}\nRole: ${input.roleTitle || "Software Engineer"}\n` +
          `Existing contacts: ${JSON.stringify(input.context.existingContacts ?? [])}\n` +
          `Research: ${JSON.stringify(input.context.research ?? {})}`,
      },
    ],
    "recruiter_discovery_v2",
    discoverySchema,
    { userId: input.userId },
  );

  const contacts: DiscoveredContact[] = (result.data.contacts ?? []).map((c) => {
    const profileUrl = c.profile_url?.trim() || c.linkedin_url?.trim() || null;
    const email = isPlausibleEmail(c.email) ? c.email!.trim() : null;
    return {
      name: c.name.trim(),
      title: c.title.trim(),
      role: c.role,
      profile_url: profileUrl,
      linkedin_url:
        c.linkedin_url?.trim() ||
        (profileUrl && /linkedin\.com/i.test(profileUrl) ? profileUrl : null),
      email,
      email_verified: !!email,
      email_source: email ? ("ai_discovery" as EmailSource) : null,
      reason: c.reason?.trim() || "AI discovery",
      searchQuery:
        c.searchQuery?.trim() ||
        `"${input.companyName}" ${input.roleTitle || "recruiter"} LinkedIn`,
      source: "ai_discovery",
      confidence_score: scoreContact({
        name: c.name,
        role: c.role,
        requestedRole: input.roleTitle,
        profileUrl,
        email,
        email_source: email ? "ai_discovery" : null,
        source: "ai_discovery",
      }),
    };
  });

  return contacts;
}

// fallbackContacts removed — violates "never create fake data" constraint

// ───────────────────────────── V3 — Enhanced Discovery ─────────────────────

export type DiscoveredContactV3 = Omit<
  DiscoveredContact,
  "department" | "source_url" | "source_metadata"
> & {
  department: string | null;
  source_url: string | null;
  source_metadata: Record<string, any>;
  last_verified_at: string | null;
};

export async function scrapePressReleases(
  companyUrl: string,
): Promise<Array<{ name: string; title: string; source: string; sourceUrl: string }>> {
  const pressUrls = [
    `${companyUrl.replace(/\/$/, "")}/press`,
    `${companyUrl.replace(/\/$/, "")}/news`,
    `${companyUrl.replace(/\/$/, "")}/press-releases`,
    `${companyUrl.replace(/\/$/, "")}/blog`,
  ];
  const results: Array<{ name: string; title: string; source: string; sourceUrl: string }> = [];

  for (const url of pressUrls) {
    try {
      const html = await fetchHtml(url);
      if (!html) continue;
      const { load } = await import("cheerio");
      const $ = load(html);
      $("article, .post, .press-release, .news-item").each((_i: number, el: any) => {
        const text = $(el).text();
        const nameMatch = text.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g);
        if (nameMatch) {
          for (const name of nameMatch) {
            if (isPlausibleName(name) && !results.some((r) => r.name === name)) {
              results.push({
                name,
                title: "Mentioned in press release",
                source: "press_release",
                sourceUrl: url,
              });
            }
          }
        }
      });
    } catch {
      continue;
    }
  }
  return results;
}

export async function scrapeLinkedInViaGoogle(
  companyName: string,
): Promise<Array<{ name: string; title: string; linkedinUrl: string | null; sourceUrl: string }>> {
  const results: Array<{
    name: string;
    title: string;
    linkedinUrl: string | null;
    sourceUrl: string;
  }> = [];
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(companyName + " recruiter OR hiring manager linkedin")}`;
    const html = await fetchHtml(searchUrl);
    if (!html) return results;
    const { load } = await import("cheerio");
    const $ = load(html);
    $("a[href*='linkedin.com/in/']").each((_i: number, el: any) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (text && isPlausibleName(text)) {
        const linkedinUrl = href.includes("linkedin.com")
          ? href.split("&")[0].replace(/\/url\?q=/, "")
          : null;
        results.push({
          name: text,
          title: "Found via Google search",
          linkedinUrl,
          sourceUrl: searchUrl,
        });
      }
    });
  } catch {
    /* noop */
  }
  return results;
}

export async function discoverContactsV3(input: {
  companyName: string;
  companyUrl?: string;
  companyDomain?: string;
  roleTitle: string;
  userId: string;
}): Promise<DiscoveredContactV3[]> {
  const contacts: DiscoveredContactV3[] = [];
  const allSources: Record<string, any[]> = {};

  if (input.companyUrl) {
    const teamData = await scrapeCompanyTeamPage(input.companyUrl);
    const careersData = await scrapeCompanyCareersPage(input.companyUrl);
    const pressData = await scrapePressReleases(input.companyUrl);
    const linkedInData = await scrapeLinkedInViaGoogle(input.companyName);

    allSources.team = teamData.teamMembers;
    allSources.careers = careersData.teamMembers;
    allSources.press = pressData;
    allSources.linkedin = linkedInData;

    for (const member of teamData.teamMembers) {
      const role = classifyTeamMemberRole(member.title);
      const email = member.email && isPlausibleEmail(member.email) ? member.email.trim() : null;
      contacts.push({
        name: member.name,
        title: member.title,
        role,
        department: inferDepartment(member.title),
        profile_url: member.linkedin,
        email,
        email_verified: !!email,
        email_source: email ? "website" : null,
        linkedin_url: member.linkedin,
        reason: `Found on company team/about page`,
        searchQuery: `"${input.companyName}" ${input.roleTitle || "recruiter"}`,
        source: "company_website",
        source_url: `${input.companyUrl}/team`,
        source_metadata: { pageType: "team" },
        confidence_score: scoreContact({
          name: member.name,
          role,
          requestedRole: input.roleTitle,
          profileUrl: member.linkedin,
          email,
          email_source: email ? "website" : null,
          source: "company_website",
        }),
        last_verified_at: new Date().toISOString(),
      });
    }

    for (const member of careersData.teamMembers) {
      if (!contacts.some((c) => c.name.toLowerCase() === member.name.toLowerCase())) {
        const role = classifyTeamMemberRole(member.title || "Hiring Manager");
        const email = member.email && isPlausibleEmail(member.email) ? member.email.trim() : null;
        contacts.push({
          name: member.name,
          title: member.title || "Hiring Team",
          role,
          department: inferDepartment(member.title || ""),
          profile_url: member.linkedin,
          email,
          email_verified: !!email,
          email_source: email ? "careers_page" : null,
          linkedin_url: member.linkedin,
          reason: `Found on company careers page`,
          searchQuery: `"${input.companyName}" ${input.roleTitle || "recruiter"}`,
          source: "careers_page",
          source_url: `${input.companyUrl}/careers`,
          source_metadata: { pageType: "careers" },
          confidence_score: scoreContact({
            name: member.name,
            role,
            requestedRole: input.roleTitle,
            profileUrl: member.linkedin,
            email,
            email_source: email ? "careers_page" : null,
            source: "careers_page",
          }),
          last_verified_at: new Date().toISOString(),
        });
      }
    }

    for (const member of pressData) {
      if (!contacts.some((c) => c.name.toLowerCase() === member.name.toLowerCase())) {
        contacts.push({
          name: member.name,
          title: member.title,
          role: "Hiring Manager",
          department: null,
          profile_url: null,
          email: null,
          email_verified: false,
          email_source: null,
          linkedin_url: null,
          reason: `Mentioned in press release`,
          searchQuery: `"${input.companyName}" press release`,
          source: "press_release",
          source_url: member.sourceUrl,
          source_metadata: { pageType: "press" },
          confidence_score: 0.4,
          last_verified_at: new Date().toISOString(),
        });
      }
    }

    for (const member of linkedInData) {
      if (!contacts.some((c) => c.name.toLowerCase() === member.name.toLowerCase())) {
        contacts.push({
          name: member.name,
          title: member.title,
          role: "Recruiter",
          department: null,
          profile_url: member.linkedinUrl,
          email: null,
          email_verified: false,
          email_source: null,
          linkedin_url: member.linkedinUrl,
          reason: `Found via Google/LinkedIn search`,
          searchQuery: `"${input.companyName}" recruiter linkedin`,
          source: "linkedin_search",
          source_url: member.sourceUrl,
          source_metadata: { pageType: "linkedin_google" },
          confidence_score: 0.5,
          last_verified_at: new Date().toISOString(),
        });
      }
    }
  }

  if (input.companyDomain) {
    for (const contact of contacts) {
      if (!contact.email && isPlausibleName(contact.name)) {
        const patterns = generateHunterPatterns(contact.name, input.companyDomain);
        if (patterns.length > 0) {
          contact.email = patterns[0];
          contact.email_verified = false;
          contact.email_source = "hunter_pattern";
        }
      }
    }
  }

  const merged = new Map<string, DiscoveredContactV3>();
  for (const c of contacts) {
    const key = c.name.toLowerCase();
    if (merged.has(key)) {
      const existing = merged.get(key)!;
      if (c.email && !existing.email) {
        existing.email = c.email;
        existing.email_verified = c.email_verified;
        existing.email_source = c.email_source;
      }
      if (c.linkedin_url && !existing.linkedin_url) existing.linkedin_url = c.linkedin_url;
      if (c.profile_url && !existing.profile_url) existing.profile_url = c.profile_url;
      if (c.title && !existing.title) existing.title = c.title;
      if (c.department && !existing.department) existing.department = c.department;
      if (c.confidence_score > existing.confidence_score) Object.assign(existing, c);
    } else {
      merged.set(key, { ...c });
    }
  }

  return [...merged.values()];
}

function inferDepartment(title: string): string | null {
  const lower = title.toLowerCase();
  if (/engineering|software|developer|architect|tech|platform/i.test(lower)) return "Engineering";
  if (/hr|people|talent|recruiting|recruiter/i.test(lower)) return "Human Resources";
  if (/marketing|growth|brand|communications/i.test(lower)) return "Marketing";
  if (/sales|account|business development/i.test(lower)) return "Sales";
  if (/product|design|ux/i.test(lower)) return "Product";
  if (/finance|accounting|legal/i.test(lower)) return "Finance";
  if (/data|ai|machine learning/i.test(lower)) return "Data";
  if (/founder|ceo|cto|coo|chief/i.test(lower)) return "Executive";
  if (/operations|ops/i.test(lower)) return "Operations";
  return null;
}
