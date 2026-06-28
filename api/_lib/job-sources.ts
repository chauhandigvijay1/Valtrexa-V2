import * as cheerio from "cheerio";
import { logger } from "./logger.js";

export type ImportedJob = {
  externalId: string;
  title: string;
  companyName: string | null;
  location: string | null;
  url: string | null;
  source: string;
  description: string;
  postedAt: string | null;
  rawPayload: Record<string, unknown>;
};

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "VALTREXA-V2/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchHtml(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 VALTREXA-V2/1.0",
      ...headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

export async function importGreenhouse(boardToken: string): Promise<ImportedJob[]> {
  const payload = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
  );
  return (payload.jobs ?? []).map((job: any) => ({
    externalId: String(job.id),
    title: job.title,
    companyName: boardToken,
    location: job.location?.name ?? null,
    url: job.absolute_url ?? null,
    source: "greenhouse",
    description: job.content ?? "",
    postedAt: job.updated_at ?? null,
    rawPayload: job,
  }));
}

export async function importLever(site: string): Promise<ImportedJob[]> {
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${site}?mode=json`);
  return (payload ?? []).map((job: any) => ({
    externalId: String(job.id),
    title: job.text,
    companyName: site,
    location: job.categories?.location ?? null,
    url: job.hostedUrl ?? null,
    source: "lever",
    description: [job.descriptionPlain, job.additionalPlain, job.listsPlain]
      .filter(Boolean)
      .join("\n\n"),
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    rawPayload: job,
  }));
}

export async function importAshby(boardUrl: string): Promise<ImportedJob[]> {
  try {
    const boardName = boardUrl.split("/").filter(Boolean).pop();
    if (boardName) {
      const postingsUrl = `https://api.ashbyhq.com/depot/v1/job-board/api/job-board-postings?jobBoardName=${boardName}`;
      const response = await fetch(postingsUrl, { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const payload = await response.json();
        return (payload.jobs ?? []).map((job: any, index: number) => ({
          externalId: String(job.id ?? job.slug ?? `${index}`),
          title: job.title ?? job.name ?? "Untitled job",
          companyName: job.companyName ?? boardName,
          location: job.location ?? job.locationName ?? null,
          url: job.jobUrl ?? job.absoluteUrl ?? null,
          source: "ashby",
          description: job.description ?? job.descriptionHtml ?? "",
          postedAt: job.publishedAt ?? job.publishedDate ?? null,
          rawPayload: job,
        }));
      }
    }
  } catch (err: any) {
    logger.error("Ashby Depot API failed:", err.message);
  }

  try {
    const html = await fetchHtml(boardUrl);
    const $ = cheerio.load(html);
    const scriptContent = $("script#__NEXT_DATA__").html();
    if (!scriptContent) {
      return [];
    }

    const data = JSON.parse(scriptContent);
    const jobs = data?.props?.pageProps?.jobs ?? data?.props?.pageProps?.jobBoard?.jobs ?? [];

    return (jobs ?? []).map((job: any, index: number) => ({
      externalId: String(job.id ?? job.slug ?? `${index}`),
      title: job.title ?? job.name ?? "Untitled job",
      companyName: job.companyName ?? null,
      location: job.location ?? job.locationName ?? null,
      url: job.jobUrl ?? job.absoluteUrl ?? null,
      source: "ashby",
      description: job.description ?? job.descriptionHtml ?? "",
      postedAt: job.publishedDate ?? null,
      rawPayload: job,
    }));
  } catch (err) {
    return [];
  }
}

function scrapeAnchorJobs(
  source: string,
  html: string,
  baseUrl: string,
  companyName?: string | null,
): ImportedJob[] {
  const $ = cheerio.load(html);
  const jobs: ImportedJob[] = [];
  const seenUrls = new Set<string>();
  let fallbackSeq = 0;

  const normalizeUrl = (url: string) =>
    url.startsWith("http") ? url : new URL(url, baseUrl).toString();

  const isDuplicate = (url: string) => {
    if (!url) return false;
    const key = normalizeUrl(url);
    if (seenUrls.has(key)) return true;
    seenUrls.add(key);
    return false;
  };

  const makeId = (url: string | null | undefined, tag: string) => {
    if (url) {
      const key = normalizeUrl(url);
      return `${source}-${tag}-${Buffer.from(key).toString("base64").slice(0, 24)}`;
    }
    return `${source}-${tag}-${fallbackSeq++}`;
  };

  const add = (input: {
    title: string;
    url?: string | null;
    companyName?: string | null;
    location?: string | null;
    description?: string;
    postedAt?: string | null;
    rawPayload: Record<string, unknown>;
    tag: string;
  }) => {
    const resolvedUrl = input.url
      ? input.url.startsWith("http")
        ? input.url
        : new URL(input.url, baseUrl).toString()
      : null;
    if (resolvedUrl && isDuplicate(resolvedUrl)) return;
    jobs.push({
      externalId: makeId(resolvedUrl, input.tag),
      title: input.title,
      companyName: input.companyName ?? companyName ?? null,
      location: input.location ?? null,
      url: resolvedUrl,
      source,
      description: input.description ?? "",
      postedAt: input.postedAt ?? null,
      rawPayload: input.rawPayload,
    });
  };

  // 1. JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() ?? "";
      if (!raw.trim()) return;
      const json = JSON.parse(raw);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item["@type"] === "JobPosting" && item.title) {
          add({
            title: item.title,
            url: item.url ?? null,
            companyName: item.hiringOrganization?.name ?? null,
            location:
              item.jobLocation?.address?.addressLocality ??
              (typeof item.jobLocation?.address === "string" ? item.jobLocation.address : null) ??
              null,
            description: item.description ?? "",
            postedAt: item.datePosted ?? null,
            rawPayload: item,
            tag: "ld",
          });
        }
      }
    } catch {
      // skip invalid JSON
    }
  });

  // 2. SSR data: __NEXT_DATA__
  {
    const script = $("script#__NEXT_DATA__").html();
    if (script) {
      try {
        const data = JSON.parse(script);
        const jobCandidates =
          data?.props?.pageProps?.jobs ??
          data?.props?.pageProps?.jobBoard?.jobs ??
          data?.props?.pageProps?.listings ??
          data?.props?.pageProps?.positions ??
          [];
        if (Array.isArray(jobCandidates)) {
          for (const job of jobCandidates) {
            const title = job.title ?? job.name ?? job.jobTitle ?? "";
            if (!title) continue;
            add({
              title,
              url: job.url ?? job.href ?? job.jobUrl ?? job.absoluteUrl ?? null,
              companyName: job.companyName ?? job.company ?? job.organization ?? null,
              location: job.location ?? job.locationName ?? null,
              description: job.description ?? job.descriptionHtml ?? "",
              postedAt: job.postedAt ?? job.publishedAt ?? job.datePosted ?? null,
              rawPayload: job,
              tag: "next",
            });
          }
        }
      } catch {
        // skip parse error
      }
    }
  }

  // 2b. SSR data: __NUXT__ / __INITIAL_STATE__ inline scripts
  $("script").each((_, el) => {
    const content = $(el).html() ?? "";
    let data: any = null;
    const nuxtMatch = content.match(/window\.__NUXT__\s*=\s*({.+?});?\s*$/s);
    const stateMatch = !nuxtMatch
      ? content.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*$/s)
      : null;
    if (nuxtMatch) {
      try {
        data = JSON.parse(nuxtMatch[1]);
      } catch {
        return;
      }
    } else if (stateMatch) {
      try {
        data = JSON.parse(stateMatch[1]);
      } catch {
        return;
      }
    }
    if (!data) return;
    const jobCandidates = data?.jobs ?? data?.jobListings ?? data?.positions ?? [];
    if (Array.isArray(jobCandidates)) {
      for (const job of jobCandidates) {
        const title = job.title ?? job.name ?? job.jobTitle ?? "";
        if (!title) continue;
        add({
          title,
          url: job.url ?? job.href ?? job.jobUrl ?? job.absoluteUrl ?? null,
          companyName: job.companyName ?? job.company ?? job.organization ?? null,
          location: job.location ?? job.locationName ?? null,
          description: job.description ?? job.descriptionHtml ?? "",
          postedAt: job.postedAt ?? job.publishedAt ?? job.datePosted ?? null,
          rawPayload: job,
          tag: "ssr",
        });
      }
    }
  });

  // 3. Find job containers (cards / listing items)
  {
    const baseTags = ["div", "section", "article", "li"]
      .flatMap((tag) =>
        [
          `${tag}[class*="job"]`,
          `${tag}[class*="position"]`,
          `${tag}[class*="listing"]`,
          `${tag}[class*="card"]`,
          `${tag}[class*="result"]`,
          `${tag}[class*="item"]`,
        ].join(","),
      )
      .join(",");

    const classOnly = [
      '[class*="JobCard"]',
      '[class*="job-card"]',
      '[class*="jobcard"]',
      '[class*="job-row"]',
      '[class*="jobRow"]',
      '[class*="job-result"]',
      '[class*="jobListing"]',
      '[class*="job-listing"]',
      '[class*="jobContainer"]',
      '[class*="job-container"]',
      '[class*="positionCard"]',
      '[class*="listingCard"]',
      '[class*="searchResult"]',
      '[class*="search-result"]',
    ].join(",");

    $(`${baseTags},${classOnly}`).each((_, container) => {
      const $c = $(container);
      if ($c.find("a").length === 0) return;

      const linkEl = $c.find("a[href]").first();
      const href = linkEl.attr("href") ?? "";
      const linkText = $(linkEl).text().replace(/\s+/g, " ").trim();

      const titleEl = $c.find('[class*="title"]').first();
      const title = titleEl.length ? titleEl.text().replace(/\s+/g, " ").trim() : linkText;

      if (title.length < 2 && !href) return;

      const companyEl = $c.find('[class*="company"],[class*="org"],[class*="employer"]').first();
      const locationEl = $c.find('[class*="location"],[class*="place"],[class*="address"]').first();

      add({
        title: title || "Untitled",
        url: href || null,
        companyName: companyEl.length ? companyEl.text().replace(/\s+/g, " ").trim() : null,
        location: locationEl.length ? locationEl.text().replace(/\s+/g, " ").trim() : null,
        description: $c.text().replace(/\s+/g, " ").trim().slice(0, 1000),
        rawPayload: {
          containerHtml: ($c.html() ?? "").slice(0, 3000),
        },
        tag: "card",
      });
    });
  }

  // 4. Fallback to anchor scraping if nothing was found
  if (jobs.length === 0) {
    $("a").each((index, el) => {
      const title = $(el).text().replace(/\s+/g, " ").trim();
      const href = $(el).attr("href");
      if (!href || !title || title.length < 8) return;
      const lowerHref = href.toLowerCase();
      if (
        !lowerHref.includes("/job") &&
        !lowerHref.includes("/jobs") &&
        !lowerHref.includes("position")
      )
        return;
      add({
        title,
        url: href,
        rawPayload: { url: href, title, fallback: true },
        tag: "a",
      });
    });
  }

  return jobs;
}

export async function importHtmlSource(
  source: "linkedin" | "naukri" | "wellfound" | "indeed" | "instahyre",
  searchUrl: string,
  headers?: Record<string, string>,
): Promise<ImportedJob[]> {
  if (source === "wellfound") {
    try {
      const parsed = new URL(searchUrl);
      const query = parsed.searchParams.get("q") ?? parsed.searchParams.get("query") ?? "";
      const apiUrl = `https://api.angel.co/1/jobs${query ? `?query=${encodeURIComponent(query)}` : ""}`;
      const response = await fetch(apiUrl, {
        headers: {
          "user-agent": "VALTREXA-V2/1.0",
          accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const data = await response.json();
        const apiJobs: ImportedJob[] = (data.jobs ?? []).map((job: any, index: number) => ({
          externalId: `wellfound-api-${job.id ?? index}`,
          title: job.title ?? "Untitled",
          companyName: job.startup?.name ?? null,
          location: job.location ?? null,
          url: job.job_url ?? null,
          source: "wellfound",
          description: job.description ?? "",
          postedAt: job.created_at ?? null,
          rawPayload: job,
        }));
        if (apiJobs.length > 0) return apiJobs;
      }
    } catch {
      // API failed, fall through to HTML scrape
    }
  }

  const html = await fetchHtml(searchUrl, headers);
  return scrapeAnchorJobs(source, html, searchUrl);
}
